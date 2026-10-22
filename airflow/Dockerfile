FROM apache/airflow:3.3.2

COPY requirements.txt /requirements.txt
# Cài kèm đúng phiên bản airflow để pip không nâng/hạ cấp airflow
RUN pip install --no-cache-dir "apache-airflow==${AIRFLOW_VERSION}" -r /requirements.txt \
 && python -m nltk.downloader -q -d /home/airflow/nltk_data wordnet omw-1.4
