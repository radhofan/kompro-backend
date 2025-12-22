-- Users table
CREATE TABLE "User" (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    username_email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50),
    nim_nip VARCHAR(50)
);

-- Locations table
CREATE TABLE "Locations" (
    location_id SERIAL PRIMARY KEY,
    location_name VARCHAR(150) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius DOUBLE PRECISION,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Attendance table
CREATE TABLE "Attendance" (
    attendance_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES "User"(user_id) ON DELETE CASCADE,
    location_id INT NOT NULL REFERENCES "Locations"(location_id) ON DELETE CASCADE,
    type VARCHAR(50),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_latitude DOUBLE PRECISION,
    user_longitude DOUBLE PRECISION,
    status VARCHAR(50),
    notes TEXT
);

INSERT INTO "User" (name, username_email, password_hash, role, nim_nip)
VALUES
('Alice Johnson', 'alice@example.com', 'hashed_password_1', 'student', 'NIM12345'),
('Bob Smith', 'bob@example.com', 'hashed_password_2', 'student', 'NIM12346'),
('Carol Lee', 'carol@example.com', 'hashed_password_3', 'teacher', 'NIP98765'),
('David Kim', 'david@example.com', 'hashed_password_4', 'student', 'NIM12347'),
('Eva Martinez', 'eva@example.com', 'hashed_password_5', 'teacher', 'NIP98766'),
('Pronen', 'amliste28@gmail.com', 'amliste28', 'developer', 'NIP232323');