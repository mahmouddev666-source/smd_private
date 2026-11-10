/**
 * SMD - Suez Methanol Derivatives Co.
 * Full Backend Architecture, Database Schema, and Python Integration
 */

export const DATABASE_SQL_SCHEMA = `-- ==============================================================
-- SMD (Suez Methanol Derivatives Co.)
-- Enterprise Local HR & Attendance Management System
-- Database Schema: SQLite / PostgreSQL Dual-Compatible
-- ==============================================================

-- 1. Departments Table (17 Exact Departments)
CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ar VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO departments (id, name_ar) VALUES
(1, 'العلاقات العامه والاتصالات الحكوميه والامن الميداني'),
(2, 'الموارد البشريه'),
(3, 'الشؤون الماليه'),
(4, 'العمليات'),
(5, 'الشؤون الفنيه والتخطيط'),
(6, 'الصيانه'),
(7, 'التفتيش الهندسي والجوده'),
(8, 'الخدمات المساعده'),
(9, 'نظم المعلومات والاتصالات'),
(10, 'الشؤون التجاريه'),
(11, 'السلامه والصحه المهنيه وحمايه البيئه'),
(12, 'قطاع الدراسات الفنيه'),
(13, 'قطاع سلامه العمليات'),
(14, 'قطاع الشئون القانونيه والعقود'),
(15, 'قطاع المراجعه الداخليه'),
(16, 'اداره التسويق'),
(17, 'اداره الامانه العامه لمجلس الاداره ومكتب رئيس مجلس الاداره');

-- 2. Employees Table
CREATE TABLE IF NOT EXISTS employees (
    serial INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id VARCHAR(50) NOT NULL UNIQUE,       -- كود الموظف / ZKTeco PIN
    name VARCHAR(255) NOT NULL,                    -- الاسم بالكامل
    mobile VARCHAR(50) NOT NULL,                   -- رقم المحمول
    email VARCHAR(150),                            -- البريد الإلكتروني
    current_title VARCHAR(150) NOT NULL,           -- المسمى الوظيفي الحالي
    position VARCHAR(150) NOT NULL,                -- الوظيفة
    assigned_title VARCHAR(150),                   -- المسمى المكلف به
    department_id INTEGER NOT NULL REFERENCES departments(id),
    department_name VARCHAR(255) NOT NULL,
    contract_type VARCHAR(50) NOT NULL,            -- دائم / محدد المدة / مؤقت
    grade VARCHAR(50) NOT NULL,                    -- الدرجة الوظيفية
    work_location VARCHAR(150) NOT NULL,           -- موقع العمل (مصنع السويس)
    national_id VARCHAR(14) NOT NULL UNIQUE,       -- الرقم القومي (14 رقم)
    insurance_id VARCHAR(50) NOT NULL,             -- الرقم التأميني
    hourly_rate DECIMAL(10, 2) DEFAULT 85.00,      -- أجر الساعة للإضافي
    hire_date DATE NOT NULL,
    default_shift VARCHAR(50) DEFAULT 'NORMAL_DAY',-- NORMAL_DAY, DAY_SHIFT, NIGHT_SHIFT
    photo_url TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_emp_code ON employees(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_dept ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_emp_national ON employees(national_id);

-- 3. Leave Balances Table (3-Year Sick Renewal Tracking)
CREATE TABLE IF NOT EXISTS leave_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id VARCHAR(50) NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    annual_opening INTEGER DEFAULT 21,
    casual_opening INTEGER DEFAULT 7,
    sick_opening INTEGER DEFAULT 90,               -- رصيد 90 يوم يجدد كل 3 سنوات
    sick_cycle_start_year INTEGER NOT NULL,        -- بداية دورة الـ 3 سنوات
    annual_used INTEGER DEFAULT 0,
    casual_used INTEGER DEFAULT 0,
    sick_used INTEGER DEFAULT 0,
    other_used INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, year)
);

-- 4. Leaves History Table
CREATE TABLE IF NOT EXISTS leaves (
    id VARCHAR(50) PRIMARY KEY,
    employee_id VARCHAR(50) NOT NULL REFERENCES employees(employee_id),
    leave_type VARCHAR(50) NOT NULL,               -- اعتيادي، عارضة، مرضي، وضع، رعاية طفل، حج، إلخ
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_count INTEGER NOT NULL,
    reason TEXT,
    replacement_emp_id VARCHAR(50),
    status VARCHAR(50) DEFAULT 'قيد المراجعة',     -- معتمد، قيد المراجعة، مرفوض
    approved_by VARCHAR(150),
    approval_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Permits & Missions Table
CREATE TABLE IF NOT EXISTS permits (
    id VARCHAR(50) PRIMARY KEY,
    employee_id VARCHAR(50) NOT NULL REFERENCES employees(employee_id),
    permit_type VARCHAR(50) NOT NULL,              -- إذن شخصي / إذن عمل
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_hours DECIMAL(4, 2) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'معتمد',
    approved_by VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS missions (
    id VARCHAR(50) PRIMARY KEY,
    employee_id VARCHAR(50) NOT NULL REFERENCES employees(employee_id),
    mission_type VARCHAR(50) NOT NULL,             -- داخلية / ببدل / بدون بدل
    destination VARCHAR(255) NOT NULL,
    purpose TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_count INTEGER NOT NULL,
    allowance_per_day DECIMAL(10, 2) DEFAULT 0.00,
    total_allowance DECIMAL(10, 2) DEFAULT 0.00,
    transportation_type VARCHAR(100),
    status VARCHAR(50) DEFAULT 'معتمد',
    approved_by VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. ZKTeco Biometric Devices Table
CREATE TABLE IF NOT EXISTS zkteco_devices (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    ip_address VARCHAR(50) NOT NULL,
    port INTEGER DEFAULT 4370,
    comm_key INTEGER DEFAULT 0,
    location VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'connected',
    last_sync TIMESTAMP,
    device_model VARCHAR(100),
    serial_number VARCHAR(100),
    firmware_version VARCHAR(100),
    total_users INTEGER DEFAULT 0,
    total_logs INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Raw Biometric Punch Logs (Direct from ZKTeco Device)
CREATE TABLE IF NOT EXISTS biometric_punches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id VARCHAR(50) REFERENCES zkteco_devices(id),
    enroll_number VARCHAR(50) NOT NULL,            -- كود الموظف
    punch_time TIMESTAMP NOT NULL,
    verify_type VARCHAR(50),                       -- Fingerprint, Face, RFID
    punch_state VARCHAR(50),                       -- In, Out, Break
    is_processed BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_punch_time ON biometric_punches(enroll_number, punch_time);

-- 8. Daily Attendance & Overtime Records (Processed via Overtime Engine)
CREATE TABLE IF NOT EXISTS attendance_records (
    id VARCHAR(50) PRIMARY KEY,
    employee_id VARCHAR(50) NOT NULL REFERENCES employees(employee_id),
    date DATE NOT NULL,
    shift_type VARCHAR(50) NOT NULL,               -- NORMAL_DAY (08:00-16:00), DAY_SHIFT (08:00-20:00), NIGHT_SHIFT (20:00-08:00)
    check_in TIME NOT NULL,
    check_out TIME NOT NULL,
    working_hours DECIMAL(5, 2) NOT NULL,
    standard_hours DECIMAL(4, 2) NOT NULL,
    
    -- Overtime Specific Fields (Strict 18:00 Cutoff)
    overtime_hours_total DECIMAL(5, 2) DEFAULT 0.00,
    day_overtime_hours DECIMAL(5, 2) DEFAULT 0.00,   -- قبل الساعة 6:00 م (x 1.35)
    night_overtime_hours DECIMAL(5, 2) DEFAULT 0.00, -- بعد 6:00 م حتى 6:00 ص (x 1.70)
    
    day_overtime_pay DECIMAL(10, 2) DEFAULT 0.00,
    night_overtime_pay DECIMAL(10, 2) DEFAULT 0.00,
    total_overtime_pay DECIMAL(10, 2) DEFAULT 0.00,
    
    source VARCHAR(50) DEFAULT 'ZKTeco-Biometric',
    status VARCHAR(50) DEFAULT 'حاضر',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, date)
);

-- 9. System License & Time-Lock Table
CREATE TABLE IF NOT EXISTS system_license (
    id INTEGER PRIMARY KEY DEFAULT 1,
    company_name VARCHAR(255) NOT NULL,
    license_key VARCHAR(255) NOT NULL,
    expiry_date DATE NOT NULL,
    is_time_locked BOOLEAN DEFAULT 0,
    license_type VARCHAR(100) DEFAULT 'ترخيص سنوي للمؤسسة',
    max_employees INTEGER DEFAULT 500,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

export const PYTHON_FASTAPI_MAIN = `"""
=============================================================================
SMD (Suez Methanol Derivatives Co.)
Enterprise HR & Attendance Management System - Python Backend (FastAPI)
Local Network Server Deployment
=============================================================================
"""

import os
from datetime import datetime, date, time
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Depends, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3
from zkteco_service import ZKTecoManager
from overtime_calc import calculate_employee_overtime

app = FastAPI(
    title="SMD HR & Attendance Local API",
    description="Suez Methanol Derivatives Co. Local Server API with ZKTeco & Overtime Engine",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.getenv("SMD_DB_PATH", "smd_hr_local.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

# ----------------- Models -----------------
class EmployeeCreate(BaseModel):
    employee_id: str
    name: str
    mobile: str
    email: Optional[str]
    current_title: str
    position: str
    assigned_title: Optional[str]
    department_id: int
    department_name: str
    contract_type: str
    grade: str
    work_location: str
    national_id: str
    insurance_id: str
    hourly_rate: float = 85.0
    hire_date: str
    default_shift: str = "NORMAL_DAY"

class OvertimeTestRequest(BaseModel):
    shift_type: str
    check_in: str   # "07:55"
    check_out: str  # "20:00"
    hourly_rate: float = 85.0

class ZKDeviceSyncRequest(BaseModel):
    ip_address: str
    port: int = 4370
    comm_key: int = 0

# ----------------- Endpoints -----------------

@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "company": "Suez Methanol Derivatives Co. (SMD)",
        "server_time": datetime.now().isoformat(),
        "database": "SQLite / Local"
    }

@app.get("/api/employees")
def list_employees(db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM employees ORDER BY serial ASC")
    rows = cursor.fetchall()
    return [dict(row) for row in rows]

@app.post("/api/employees")
def create_employee(emp: EmployeeCreate, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    try:
        cursor.execute("""
            INSERT INTO employees (
                employee_id, name, mobile, email, current_title, position,
                assigned_title, department_id, department_name, contract_type,
                grade, work_location, national_id, insurance_id, hourly_rate,
                hire_date, default_shift
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            emp.employee_id, emp.name, emp.mobile, emp.email, emp.current_title,
            emp.position, emp.assigned_title, emp.department_id, emp.department_name,
            emp.contract_type, emp.grade, emp.work_location, emp.national_id,
            emp.insurance_id, emp.hourly_rate, emp.hire_date, emp.default_shift
        ))
        db.commit()
        return {"status": "success", "employee_id": emp.employee_id}
    except sqlite3.IntegrityError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/overtime/calculate")
def test_overtime(req: OvertimeTestRequest):
    # Parse times into today's datetimes
    today = date.today()
    in_h, in_m = map(int, req.check_in.split(":"))
    out_h, out_m = map(int, req.check_out.split(":"))
    in_dt = datetime.combine(today, time(in_h, in_m))
    out_dt = datetime.combine(today, time(out_h, out_m))
    
    result = calculate_employee_overtime(
        shift_type=req.shift_type,
        check_in_dt=in_dt,
        check_out_dt=out_dt,
        hourly_rate=req.hourly_rate
    )
    return result

@app.post("/api/zkteco/sync")
def sync_zkteco(req: ZKDeviceSyncRequest, background_tasks: BackgroundTasks):
    manager = ZKTecoManager(ip=req.ip_address, port=req.port, comm_key=req.comm_key)
    result = manager.test_connection()
    if not result.get("connected"):
        raise HTTPException(status_code=502, detail=result.get("error", "Failed to connect to ZKTeco device"))
    
    # Pull attendance punches in background and compute overtime
    punches = manager.pull_attendance_records()
    return {
        "status": "connected",
        "punches_retrieved": len(punches),
        "device_info": result.get("device_info")
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
`;

export const PYTHON_ZKTECO_SERVICE = `"""
=============================================================================
SMD (Suez Methanol Derivatives Co.)
ZKTeco Hardware Integration Service via pyzk SDK
Network/TCP Connection & Punch Log Extractor
=============================================================================
"""

import logging
from datetime import datetime
try:
    from zk import ZK, const
except ImportError:
    ZK = None

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SMD_ZKTECO")

class ZKTecoManager:
    def __init__(self, ip: str = "192.168.1.201", port: int = 4370, comm_key: int = 0, timeout: int = 5):
        self.ip = ip
        self.port = port
        self.comm_key = comm_key
        self.timeout = timeout
        self.conn = None

    def test_connection(self):
        """Pings and attempts TCP handshake with ZKTeco Biometric Terminal."""
        if not ZK:
            return {
                "connected": False,
                "error": "pyzk library not installed. Run 'pip install pyzk' on the local company server."
            }
        zk_instance = ZK(self.ip, port=self.port, timeout=self.timeout, password=self.comm_key)
        try:
            conn = zk_instance.connect()
            conn.disable_device() # Good practice during data transfer
            
            serial = conn.get_serialnumber()
            firmware = conn.get_firmware_version()
            device_name = conn.get_device_name()
            users_count = len(conn.get_users())
            
            conn.enable_device()
            conn.disconnect()
            
            return {
                "connected": True,
                "device_info": {
                    "ip": self.ip,
                    "serial_number": serial,
                    "firmware": firmware,
                    "device_name": device_name,
                    "registered_users": users_count
                }
            }
        except Exception as e:
            logger.error(f"ZKTeco Connection failed for {self.ip}:{self.port} -> {e}")
            return {
                "connected": False,
                "error": str(e)
            }

    def pull_attendance_records(self, clear_device_logs: bool = False):
        """
        Extracts raw attendance timestamps from device flash memory.
        Matches punches with SMD Employee IDs and returns structured log.
        """
        if not ZK:
            return []
        zk_instance = ZK(self.ip, port=self.port, timeout=self.timeout, password=self.comm_key)
        records = []
        try:
            conn = zk_instance.connect()
            conn.disable_device()
            
            attendances = conn.get_attendance()
            for att in attendances:
                records.append({
                    "enroll_number": str(att.user_id),
                    "timestamp": att.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "status": att.status, # 0 = Check In, 1 = Check Out
                    "punch": att.punch
                })
                
            if clear_device_logs:
                conn.clear_attendance()
                
            conn.enable_device()
            conn.disconnect()
            return records
        except Exception as e:
            logger.error(f"Failed to pull attendance from ZKTeco: {e}")
            return []
`;

export const PYTHON_REQUIREMENTS = `# SMD Local Server Python Dependencies
fastapi>=0.110.0
uvicorn[standard]>=0.28.0
pyzk>=0.9.1
pydantic>=2.6.0
sqlalchemy>=2.0.28
pandas>=2.2.0
openpyxl>=3.1.2
python-multipart>=0.0.9
requests>=2.31.0
`;
