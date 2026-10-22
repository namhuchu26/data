-- Chạy 1 lần khi PostgreSQL khởi tạo lần đầu.
-- Tạo database riêng cho metadata của Airflow (tách khỏi kho dữ liệu dwh).
CREATE USER airflow WITH PASSWORD 'airflow';
CREATE DATABASE airflow OWNER airflow;
