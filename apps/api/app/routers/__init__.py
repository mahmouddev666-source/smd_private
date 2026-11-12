"""API v1 router aggregation."""

from fastapi import APIRouter

from app.routers import (
    attendance,
    auth,
    devices,
    employees,
    forms,
    health,
    leave_balances,
    leaves,
    permits,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(employees.router)
api_router.include_router(attendance.router)
api_router.include_router(leaves.router)
api_router.include_router(leave_balances.router)
api_router.include_router(permits.router)
api_router.include_router(devices.router)
api_router.include_router(forms.router)
