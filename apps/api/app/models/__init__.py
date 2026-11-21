"""All SQLAlchemy models. Importing this module registers them on Base.metadata."""

from app.models.attendance import Attendance
from app.models.audit import AuditLog
from app.models.device import BiometricPunch, ZktecoDevice, ZktecoSyncLog
from app.models.employee import Employee
from app.models.form import FormFile, FormFileVersion, FormSubmission, FormTemplate, OfficeSession
from app.models.leave import Leave, LeaveBalance
from app.models.permit import Mission, Permit
from app.models.settings import WorkSettings
from app.models.user import User

__all__ = [
    "Attendance",
    "AuditLog",
    "BiometricPunch",
    "Employee",
    "FormFile",
    "FormFileVersion",
    "FormSubmission",
    "FormTemplate",
    "Leave",
    "LeaveBalance",
    "Mission",
    "OfficeSession",
    "Permit",
    "User",
    "WorkSettings",
    "ZktecoDevice",
    "ZktecoSyncLog",
]
