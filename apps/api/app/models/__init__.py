"""All SQLAlchemy models. Importing this module registers them on Base.metadata."""

from app.models.attendance import Attendance
from app.models.audit import AuditLog
from app.models.device import BiometricPunch, ZktecoDevice
from app.models.employee import Employee
from app.models.form import FormFile, FormSubmission, FormTemplate
from app.models.leave import Leave, LeaveBalance
from app.models.permit import Mission, Permit
from app.models.user import User

__all__ = [
    "Attendance",
    "AuditLog",
    "BiometricPunch",
    "Employee",
    "FormFile",
    "FormSubmission",
    "FormTemplate",
    "Leave",
    "LeaveBalance",
    "Mission",
    "Permit",
    "User",
    "ZktecoDevice",
]
