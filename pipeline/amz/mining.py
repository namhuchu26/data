"""Bước 4 - Khai phá: dữ liệu lấy từ kho -> TF-IDF -> Naive Bayes / Logistic Regression.

Mô hình LSTM được huấn luyện trên Colab (notebooks/train_lstm_colab.ipynb) với cùng tập
dữ liệu curated, rồi đẩy metrics.json về curated/models/lstm/ để Portal so sánh.
"""
import datetime as dt
import io
import time

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score,
                             precision_recall_fscore_support)
from sklearn.model_selection import StratifiedKFold, cross_val_predict, train_test_split
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import make_pipeline

from . import config, lake
from .load import connect

LABELS = config.LABELS


def _tfidf():
    return TfidfVectorizer(ngram_range=(1, 2), min_df=3, max_features=50_000, sublinear_tf=True)


def build_dataset() -> dict:
    """Trích dữ liệu chuẩn hóa từ kho, chia train/test phân tầng (stratify) 80/20."""
    sql = """
        SELECT f.review_key, f.rating, f.sentiment_label, t.text_clean, t.text_light
        FROM fact_reviews f JOIN review_text t USING (review_key)
    """
    with connect() as conn, conn.cursor() as cur:
        cur.execute(sql)
        df = pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description])
    train_idx, _ = train_test_split(df.index, test_size=0.2, stratify=df["sentiment_label"],
                                    random_state=config.RANDOM_SEED)
    df["split"] = np.where(df.index.isin(train_idx), "train", "test")
    lake.put_parquet(config.CURATED, config.CUR_DATASET, df)
    return {"rows": len(df), "train": int((df["split"] == "train").sum()),
            "test": int((df["split"] == "test").sum())}


def _evaluate(name, display, y_true, y_pred, extra) -> dict:
    p, r, f, s = precision_recall_fscore_support(y_true, y_pred, labels=LABELS, zero_division=0)
    pm, rm, fm, _ = precision_recall_fscore_support(y_true, y_pred, labels=LABELS,
                                                    average="macro", zero_division=0)
    return {
        "model": name, "display_name": display, "family": "Machine Learning",
        "trained_at": dt.datetime.now().isoformat(timespec="seconds"),
        "labels": LABELS,
        "accuracy": round(accuracy_score(y_true, y_pred), 4),
        "precision_macro": round(pm, 4), "recall_macro": round(rm, 4), "f1_macro": round(fm, 4),
        "f1_weighted": round(f1_score(y_true, y_pred, average="weighted"), 4),
        "per_class": {lab: {"precision": round(p[i], 4), "recall": round(r[i], 4),
                            "f1": round(f[i], 4), "support": int(s[i])}
                      for i, lab in enumerate(LABELS)},
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=LABELS).tolist(),
        **extra,
    }


def train_baselines() -> dict:
    df = lake.get_parquet(config.CURATED, config.CUR_DATASET)
    tr, te = df[df["split"] == "train"], df[df["split"] == "test"]
    vec = _tfidf()
    X_tr = vec.fit_transform(tr["text_clean"])
    X_te = vec.transform(te["text_clean"])
    common = {"n_train": len(tr), "n_test": len(te),
              "features": "TF-IDF (1-2 gram, 50K đặc trưng)",
              "label_distribution": te["sentiment_label"].value_counts().to_dict()}

    models = {
        "naive_bayes": ("Multinomial Naive Bayes",
                        MultinomialNB(alpha=0.3, fit_prior=False)),
        "logistic_regression": ("Logistic Regression",
                                LogisticRegression(max_iter=2000, C=2.0, class_weight="balanced")),
    }
    summary = {}
    for name, (display, model) in models.items():
        t0 = time.time()
        model.fit(X_tr, tr["sentiment_label"])
        secs = round(time.time() - t0, 2)
        pred = model.predict(X_te)
        extra = {**common, "train_seconds": secs, "params": model.get_params()}
        if name == "logistic_regression":
            terms = np.array(vec.get_feature_names_out())
            extra["top_terms"] = {
                lab: [[terms[j], round(float(model.coef_[i][j]), 3)]
                      for j in np.argsort(model.coef_[i])[::-1][:15]]
                for i, lab in enumerate(model.classes_)}
        m = _evaluate(name, display, te["sentiment_label"], pred, extra)
        lake.put_json(config.CURATED, f"models/{name}/metrics.json", m)
        summary[name] = {"accuracy": m["accuracy"], "f1_macro": m["f1_macro"]}
    return summary


def score_reviews() -> dict:
    """Tính sentiment_score cho mọi review bằng dự đoán out-of-fold (5-fold), tránh để mô hình
    chấm điểm chính dữ liệu nó đã học. Ghi ngược vào fact_reviews."""
    df = lake.get_parquet(config.CURATED, config.CUR_DATASET)
    pipe = make_pipeline(_tfidf(), LogisticRegression(max_iter=2000, C=2.0,
                                                      class_weight="balanced"))
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=config.RANDOM_SEED)
    proba = cross_val_predict(pipe, df["text_clean"], df["sentiment_label"], cv=cv,
                              method="predict_proba", n_jobs=2)
    classes = sorted(LABELS)  # thứ tự cột predict_proba = thứ tự chữ cái của nhãn
    out = pd.DataFrame({
        "review_key": df["review_key"],
        "sentiment_score": (proba[:, classes.index("positive")]
                            - proba[:, classes.index("negative")]).round(4),
        "sentiment_pred": np.array(classes)[proba.argmax(axis=1)],
    })
    lake.put_parquet(config.CURATED, config.CUR_PREDICTIONS, out)

    with connect() as conn, conn.cursor() as cur:
        cur.execute("CREATE TEMP TABLE tmp_score (review_key BIGINT, sentiment_score NUMERIC(6,4),"
                    " sentiment_pred VARCHAR(10)) ON COMMIT DROP")
        buf = io.StringIO()
        out.to_csv(buf, index=False, header=False)
        buf.seek(0)
        cur.copy_expert("COPY tmp_score FROM STDIN WITH (FORMAT csv)", buf)
        cur.execute("UPDATE fact_reviews f SET sentiment_score = t.sentiment_score,"
                    " sentiment_pred = t.sentiment_pred FROM tmp_score t"
                    " WHERE f.review_key = t.review_key")
        updated = cur.rowcount
    return {"scored": updated,
            "oof_accuracy": round(float((out["sentiment_pred"].values
                                         == df["sentiment_label"].values).mean()), 4)}
