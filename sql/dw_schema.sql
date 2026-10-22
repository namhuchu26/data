-- =====================================================================
--  Kho dữ liệu - Lược đồ hình sao (Star Schema)
--  Fact_Reviews  ->  Dim_Product, Dim_User, Dim_Time
--  (Airflow task load_warehouse chạy file này trước khi nạp dữ liệu)
-- =====================================================================

CREATE TABLE IF NOT EXISTS dim_time (
    time_key      INT PRIMARY KEY,            -- yyyymmdd
    full_date     DATE NOT NULL,
    day           SMALLINT,
    month         SMALLINT,
    quarter       SMALLINT,
    year          SMALLINT,
    year_month    CHAR(7),
    day_of_week   SMALLINT,                   -- 0 = Thứ Hai
    usd_vnd_rate  NUMERIC(12, 2)              -- Nguồn 3: World Bank API
);

CREATE TABLE IF NOT EXISTS dim_product (
    product_key     INT PRIMARY KEY,
    parent_asin     VARCHAR(20) UNIQUE NOT NULL,
    title           TEXT,
    brand           TEXT,
    store           TEXT,
    main_category   TEXT,
    categories      TEXT,
    price_usd       NUMERIC(10, 2),
    price_vnd       NUMERIC(14, 0),
    price_segment   TEXT,
    average_rating  NUMERIC(3, 2),
    rating_number   INT
);

CREATE TABLE IF NOT EXISTS dim_user (
    user_key           INT PRIMARY KEY,
    user_id            VARCHAR(40) UNIQUE NOT NULL,
    review_count       INT,
    first_review_date  DATE
);

CREATE TABLE IF NOT EXISTS fact_reviews (
    review_key         BIGINT PRIMARY KEY,
    product_key        INT REFERENCES dim_product (product_key),
    user_key           INT REFERENCES dim_user (user_key),
    time_key           INT REFERENCES dim_time (time_key),
    rating             SMALLINT,
    sentiment_label    VARCHAR(10),          -- từ rating: negative/neutral/positive
    sentiment_score    NUMERIC(6, 4),        -- P(pos) - P(neg), mô hình Logistic Regression
    sentiment_pred     VARCHAR(10),          -- nhãn mô hình dự đoán (out-of-fold)
    helpful_vote       INT,
    verified_purchase  BOOLEAN,
    text_length        INT,
    word_count         INT
);

-- Văn bản bình luận (phi cấu trúc) tách khỏi bảng fact cho gọn
CREATE TABLE IF NOT EXISTS review_text (
    review_key  BIGINT PRIMARY KEY REFERENCES fact_reviews (review_key),
    title       TEXT,
    text_raw    TEXT,
    text_clean  TEXT,                        -- cho TF-IDF (bỏ stopword, lemmatize)
    text_light  TEXT                         -- cho LSTM (giữ ngữ cảnh)
);

CREATE INDEX IF NOT EXISTS ix_fact_product ON fact_reviews (product_key);
CREATE INDEX IF NOT EXISTS ix_fact_user    ON fact_reviews (user_key);
CREATE INDEX IF NOT EXISTS ix_fact_time    ON fact_reviews (time_key);

-- Nhật ký các lần nạp kho
CREATE TABLE IF NOT EXISTS etl_load_log (
    id           SERIAL PRIMARY KEY,
    run_id       TEXT,
    loaded_at    TIMESTAMPTZ DEFAULT now(),
    fact_rows    INT,
    product_rows INT,
    user_rows    INT,
    time_rows    INT
);
