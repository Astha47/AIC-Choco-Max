#!/usr/bin/env python3
"""
Database initialization script for YOLOv12 Inference Service
Creates database and tables if they don't exist
"""

import mysql.connector
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def create_database():
    """Create database and tables"""
    
    # Database configuration
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_PORT = int(os.getenv('DB_PORT', '3306'))
    DB_USER = os.getenv('DB_USER', 'root')
    DB_PASSWORD = os.getenv('DB_PASSWORD', '')
    DB_NAME = os.getenv('DB_NAME', 'yolo_detections')
    
    try:
        # Connect to MySQL server (without specifying database)
        print(f"Connecting to MySQL server at {DB_HOST}:{DB_PORT}...")
        connection = mysql.connector.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD
        )
        
        cursor = connection.cursor()
        
        # Create database if it doesn't exist
        print(f"Creating database '{DB_NAME}' if it doesn't exist...")
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
        
        # Use the database
        cursor.execute(f"USE {DB_NAME}")
        
        # Create detections table
        print("Creating detections table...")
        create_table_query = """
        CREATE TABLE IF NOT EXISTS detections (
            id INT AUTO_INCREMENT PRIMARY KEY,
            camera_id VARCHAR(50) NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            frame_seq INT,
            label VARCHAR(100) NOT NULL,
            confidence FLOAT NOT NULL,
            bbox_x_center FLOAT NOT NULL,
            bbox_y_center FLOAT NOT NULL,
            bbox_width FLOAT NOT NULL,
            bbox_height FLOAT NOT NULL,
            INDEX idx_camera_timestamp (camera_id, timestamp),
            INDEX idx_label (label),
            INDEX idx_confidence (confidence)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
        
        cursor.execute(create_table_query)
        
        # Create camera_status table for monitoring
        print("Creating camera_status table...")
        create_status_table_query = """
        CREATE TABLE IF NOT EXISTS camera_status (
            camera_id VARCHAR(50) PRIMARY KEY,
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            status ENUM('online', 'offline', 'error') DEFAULT 'offline',
            fps FLOAT DEFAULT 0,
            total_detections INT DEFAULT 0,
            INDEX idx_status (status),
            INDEX idx_last_seen (last_seen)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
        
        cursor.execute(create_status_table_query)
        
        # Create summary view
        print("Creating detection summary view...")
        create_view_query = """
        CREATE OR REPLACE VIEW detection_summary AS
        SELECT 
            camera_id,
            DATE(timestamp) as detection_date,
            label,
            COUNT(*) as detection_count,
            AVG(confidence) as avg_confidence,
            MIN(confidence) as min_confidence,
            MAX(confidence) as max_confidence
        FROM detections
        GROUP BY camera_id, DATE(timestamp), label
        ORDER BY detection_date DESC, camera_id, detection_count DESC
        """
        
        cursor.execute(create_view_query)
        
        # Commit changes
        connection.commit()
        
        print("Database initialization completed successfully!")
        print(f"Database: {DB_NAME}")
        print("Tables created:")
        print("  - detections: stores all object detection results")
        print("  - camera_status: tracks camera connection status")
        print("  - detection_summary: view for aggregated statistics")
        
        # Show table info
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
        print(f"\nAvailable tables: {[table[0] for table in tables]}")
        
        cursor.close()
        connection.close()
        
    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        sys.exit(1)

def test_connection():
    """Test database connection"""
    
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_PORT = int(os.getenv('DB_PORT', '3306'))
    DB_USER = os.getenv('DB_USER', 'root')
    DB_PASSWORD = os.getenv('DB_PASSWORD', '')
    DB_NAME = os.getenv('DB_NAME', 'yolo_detections')
    
    try:
        print("Testing database connection...")
        connection = mysql.connector.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
        
        cursor = connection.cursor()
        cursor.execute("SELECT COUNT(*) FROM detections")
        count = cursor.fetchone()[0]
        
        print(f"Connection successful! Current detections count: {count}")
        
        cursor.close()
        connection.close()
        
    except Exception as e:
        print(f"Connection test failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        test_connection()
    else:
        create_database()
