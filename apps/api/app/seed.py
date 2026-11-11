"""Demo data seeder.

Usage:
    python -m app.seed --profile demo            # insert demo data (idempotent)
    python -m app.seed --profile demo --reset    # delete demo data only, then re-seed
    python -m app.seed --reset                   # delete ALL demo records (employees 9001+)
"""

import argparse
from datetime import date, time, timedelta
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.attendance import Attendance
from app.models.device import BiometricPunch, ZktecoDevice
from app.models.employee import Employee
from app.models.leave import Leave, LeaveBalance
from app.models.permit import Mission, Permit
from app.models.user import User
from app.utils.ids import new_id

DEMO_USERS = [
    ("admin", "مدير النظام التجريبي", "Admin@12345", "ADMIN"),
    ("hr", "مسؤول الموارد البشرية", "Hr@12345", "HR"),
    ("viewer", "مستخدم قراءة فقط", "Viewer@12345", "VIEWER"),
]

DEMO_EMPLOYEES = [
    ("9001", "م. أحمد محمود سعيد", "الإدارة العامة", "مدير عام", "29304151409811", "01000009001"),
    ("9002", "أ. حسام الدين نبيل", "الموارد البشرية", "مدير الموارد البشرية", "29004151409812", "01000009002"),
    ("9003", "م. مروان أشرف الشريف", "السلامة والصحة المهنية", "مهندس سلامة", "29504151409813", "01000009003"),
    ("9004", "م. طارق الشناوي", "الصيانة", "رئيس قسم الصيانة", "28804151409814", "01000009004"),
    ("9005", "أ. سارة إبراهيم", "المالية", "محاسب أول", "29404151409815", "01000009005"),
    ("9006", "م. كريم فؤاد", "العمليات", "مهندس عمليات", "29604151409816", "01000009006"),
    ("9007", "أ. منى عبد الله", "المشتريات", "مسؤول مشتريات", "29304151409817", "01000009007"),
    ("9008", "م. ياسر عبد العزيز", "الجودة", "مهندس جودة", "29104151409818", "01000009008"),
    ("9009", "أ. هبة مصطفى", "الموارد البشرية", "أخصائي شؤون عاملين", "29704151409819", "01000009009"),
    ("9010", "م. عمر حسن", "العمليات", "مشرف وردية", "29904151409820", "01000009010"),
    ("9011", "أ. نورهان علي", "المالية", "محاسب", "29204151409821", "01000009011"),
    ("9012", "م. شريف زكي", "الصيانة", "فني أول", "28904151409822", "01000009012"),
    ("9013", "أ. دعاء سامي", "المشتريات", "منسق مشتريات", "29804151409823", "01000009013"),
    ("9014", "م. مصطفى عادل", "السلامة والصحة المهنية", "مسؤول سلامة", "29004151409824", "01000009014"),
    ("9015", "أ. إيمان فتحي", "الجودة", "أخصائي جودة", "29604151409825", "01000009015"),
    ("9016", "م. خالد رمضان", "العمليات", "مهندس تشغيل", "28704151409826", "01000009016"),
    ("9017", "أ. ريم أشرف", "الموارد البشرية", "أخصائي تدريب", "29404151409827", "01000009017"),
    ("9018", "م. بسام نبيل", "الصيانة", "مهندس كهرباء", "29304151409828", "01000009018"),
]

DEMO_SHIFTS = ["NORMAL_DAY", "DAY_SHIFT", "NIGHT_SHIFT"]


def reset_demo(db: Session) -> None:
    codes = [row[0] for row in DEMO_EMPLOYEES]
    db.execute(delete(Employee).where(Employee.employee_id.in_(codes)))
    db.execute(delete(User).where(User.is_demo.is_(True)))
    db.execute(delete(ZktecoDevice).where(ZktecoDevice.is_demo.is_(True)))
    db.commit()
    print(f"Deleted demo employees ({len(codes)}), demo users and demo devices.")


def seed_demo(db: Session) -> None:
    for username, full_name, password, role in DEMO_USERS:
        existing = db.scalar(select(User).where(User.username == username))
        if existing is None:
            db.add(
                User(
                    id=new_id(),
                    username=username,
                    full_name=full_name,
                    password_hash=hash_password(password),
                    role=role,
                    is_active=True,
                    is_demo=True,
                )
            )

    today = date.today()
    for index, (code, name, department, title, national_id, mobile) in enumerate(DEMO_EMPLOYEES):
        if db.scalar(select(Employee).where(Employee.employee_id == code)) is not None:
            continue
        employee = Employee(
            id=new_id(),
            employee_id=code,
            name=name,
            national_id=national_id,
            insurance_id=f"69{index:06d}",
            mobile=mobile,
            email=f"{code}@smd.com.eg",
            department=department,
            current_title=title,
            position=title,
            assigned_title="",
            contract_type="دائم",
            grade="أولى" if index % 3 else "ثانية",
            work_location="مصنع السويس لمشتقات الميثانول",
            hourly_rate=Decimal("90.00"),
            hire_date=today - timedelta(days=400 + index * 30),
            default_shift=DEMO_SHIFTS[index % len(DEMO_SHIFTS)],
            is_active=True,
            is_demo=True,
        )
        db.add(employee)
        db.flush()

        db.add(
            LeaveBalance(
                id=new_id(),
                employee_id=code,
                year=today.year,
                annual_total=Decimal("30") if title.startswith("مدير") else Decimal("21"),
                annual_used=Decimal("0"),
                casual_total=Decimal("7"),
                casual_used=Decimal("0"),
                sick_total=Decimal("90"),
                sick_used=Decimal("0"),
                is_demo=True,
            )
        )

        # 30 days of attendance ending today.
        for day_offset in range(30):
            day = today - timedelta(days=day_offset)
            if day.weekday() == 4:  # Friday
                continue
            db.add(
                Attendance(
                    id=new_id(),
                    employee_id=code,
                    date=day,
                    check_in=time(8, 0),
                    check_out=time(16, 0) if day_offset % 7 else time(18, 0),
                    status="حاضر",
                    overtime_minutes=0 if day_offset % 7 else 120,
                    late_minutes=0,
                    early_leave_minutes=0,
                    notes="",
                    is_demo=True,
                )
            )

    if db.scalar(select(ZktecoDevice).limit(1)) is None:
        db.add_all(
            [
                ZktecoDevice(
                    id=new_id(),
                    name="ZK-01 (البوابة الرئيسية)",
                    ip_address="192.168.1.201",
                    port=4370,
                    location="البوابة الرئيسية",
                    model="ZKTeco K40",
                    status="disconnected",
                    is_demo=True,
                ),
                ZktecoDevice(
                    id=new_id(),
                    name="ZK-02 (المصنع)",
                    ip_address="192.168.1.202",
                    port=4370,
                    location="مدخل المصنع",
                    model="ZKTeco F18",
                    status="disconnected",
                    is_demo=True,
                ),
            ]
        )

    db.commit()
    print("Demo data seeded: 3 users, 18 employees, balances, attendance and devices.")


def main() -> None:
    parser = argparse.ArgumentParser(description="SMD-HR demo seeder")
    parser.add_argument("--profile", default="demo", choices=["demo"])
    parser.add_argument("--reset", action="store_true", help="delete demo data first")
    parser.add_argument("--reset-demo", dest="reset_demo_only", action="store_true")
    parser.add_argument("--create-tables", action="store_true", help="create tables if missing")
    args = parser.parse_args()

    if args.create_tables:
        Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        if args.reset or args.reset_demo_only:
            reset_demo(db)
        if not args.reset_demo_only:
            seed_demo(db)


if __name__ == "__main__":
    main()
