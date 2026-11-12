/**
 * SMD - Suez Methanol Derivatives Co.
 * Typed client for the FastAPI backend.
 *
 * All business data now comes from PostgreSQL through `/api`. The browser only
 * keeps the access token and the UI session; see AGENTS.md rule #1.
 */

import {
  AttendanceRecord,
  Employee,
  LeaveBalance,
  LeaveRecord,
  MissionRecord,
  PermitRecord,
  ShiftType,
  UserRole,
  UserSession,
  ZKTecoDevice,
} from '../types';
import { calculateOvertime } from '../utils/overtimeCalculator';
import { normalizeTime } from '../utils/dateUtils';

const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api').replace(/\/+$/, '');

const TOKEN_KEY = 'smd_hr_access_token';
const SESSION_KEY = 'smd_hr_user_session';

/** Set to `false` in production builds so the app never silently falls back. */
export const ALLOW_OFFLINE_DEMO = (import.meta.env.VITE_ALLOW_OFFLINE_DEMO as string | undefined) !== 'false';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: { field: string; message: string }[];

  constructor(status: number, message: string, code: string, fields?: { field: string; message: string }[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export class NetworkError extends Error {
  constructor(message = 'تعذر الاتصال بخادم SMD-HR. تحقق من تشغيل الخدمة والشبكة.') {
    super(message);
    this.name = 'NetworkError';
  }
}

// ---------------------------------------------------------------------------
// Token + session storage (allowed: session only, never business data)
// ---------------------------------------------------------------------------

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage full / disabled */
  }
}

export function getStoredSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as UserSession) : null;
  } catch {
    return null;
  }
}

export function setStoredSession(session: UserSession | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage full / disabled */
  }
}

// ---------------------------------------------------------------------------
// Low level request helper
// ---------------------------------------------------------------------------

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = 20000 } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const externalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', externalAbort);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new NetworkError('انتهت مهلة الاتصال بالخادم. حاول مرة أخرى.');
    }
    throw new NetworkError();
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener('abort', externalAbort);
  }

  if (response.status === 401) {
    setToken(null);
    setStoredSession(null);
  }

  if (!response.ok) {
    let payload: { detail?: string; code?: string; errors?: { field: string; message: string }[] } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      /* non JSON error body */
    }
    const message =
      typeof payload.detail === 'string' ? payload.detail : `فشل الطلب (${response.status}). يرجى المحاولة مرة أخرى.`;
    throw new ApiError(response.status, message, payload.code || 'HTTP_ERROR', payload.errors);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// DTOs (snake_case, exactly what FastAPI returns)
// ---------------------------------------------------------------------------

export interface UserDto {
  id: string;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_demo: boolean;
}

interface TokenDto {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserDto;
}

export interface EmployeeDto {
  id: string;
  employee_id: string;
  name: string;
  national_id: string | null;
  insurance_id: string | null;
  mobile: string | null;
  email: string | null;
  department: string;
  current_title: string;
  position: string;
  assigned_title: string;
  contract_type: string;
  grade: string;
  work_location: string;
  hourly_rate: number;
  hire_date: string;
  default_shift: string;
  is_active: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

interface AttendanceDto {
  id: string;
  employee_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  overtime_minutes: number;
  late_minutes: number;
  early_leave_minutes: number;
  notes: string;
  is_demo: boolean;
}

interface LeaveDto {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string;
  replacement_employee_id: string | null;
  status: string;
  approved_by: string | null;
  approval_date: string | null;
  notes: string;
  is_demo: boolean;
}

interface BalanceDto {
  id: string;
  employee_id: string;
  year: number;
  annual_total: number;
  annual_used: number;
  casual_total: number;
  casual_used: number;
  sick_total: number;
  sick_used: number;
  is_demo: boolean;
}

interface PermitDto {
  id: string;
  employee_id: string;
  permit_type: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  reason: string;
  status: string;
  approved_by: string | null;
  is_demo: boolean;
}

interface MissionDto {
  id: string;
  employee_id: string;
  mission_type: string;
  destination: string;
  purpose: string;
  start_date: string;
  end_date: string;
  days_count: number;
  allowance_per_day: number;
  total_allowance: number;
  transportation_type: string;
  status: string;
  approved_by: string | null;
  is_demo: boolean;
}

interface DeviceDto {
  id: string;
  name: string;
  ip_address: string;
  port: number;
  location: string;
  model: string;
  status: string;
  is_demo: boolean;
}

interface PageDto<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Mappers (DTO -> UI types)
// ---------------------------------------------------------------------------

const TIME_ONLY = /^(\d{2}):(\d{2})(?::\d{2})?$/;

function hhmm(value: string | null | undefined): string {
  if (!value) return '';
  const match = TIME_ONLY.exec(value);
  return match ? `${match[1]}:${match[2]}` : normalizeTime(value) ?? '';
}

function toRole(role: string): UserRole {
  if (role === 'ADMIN') return 'ADMIN';
  if (role === 'HR' || role === 'SUPERVISOR') return 'HR';
  return 'VIEWER';
}

function asShiftType(value: string | undefined): ShiftType {
  return value === 'DAY_SHIFT' || value === 'NIGHT_SHIFT' ? value : 'NORMAL_DAY';
}

export function mapUser(dto: UserDto): UserSession {
  return {
    id: dto.id,
    name: dto.full_name,
    email: `${dto.username}@smd.com.eg`,
    role: toRole(dto.role),
  };
}

export function mapEmployee(dto: EmployeeDto, index = 0): Employee {
  return {
    serial: index + 1,
    employeeId: dto.employee_id,
    name: dto.name,
    mobile: dto.mobile || '',
    email: dto.email || '',
    currentTitle: dto.current_title,
    position: dto.position,
    assignedTitle: dto.assigned_title,
    department: dto.department,
    contractType: dto.contract_type as Employee['contractType'],
    grade: dto.grade as Employee['grade'],
    workLocation: dto.work_location as Employee['workLocation'],
    nationalId: dto.national_id || '',
    insuranceId: dto.insurance_id || '',
    hourlyRate: Number(dto.hourly_rate),
    hireDate: dto.hire_date,
    defaultShift: asShiftType(dto.default_shift),
    isActive: dto.is_active,
    isDemo: dto.is_demo,
  };
}

export function employeeToPayload(employee: Omit<Employee, 'serial'>): Record<string, unknown> {
  return {
    employee_id: employee.employeeId,
    name: employee.name,
    national_id: employee.nationalId || null,
    insurance_id: employee.insuranceId || null,
    mobile: employee.mobile || null,
    email: employee.email || null,
    department: employee.department,
    current_title: employee.currentTitle,
    position: employee.position,
    assigned_title: employee.assignedTitle,
    contract_type: employee.contractType,
    grade: employee.grade,
    work_location: employee.workLocation,
    hourly_rate: employee.hourlyRate,
    hire_date: employee.hireDate,
    default_shift: employee.defaultShift,
    is_active: employee.isActive,
  };
}

export function mapAttendance(dto: AttendanceDto, employee: Employee | undefined): AttendanceRecord {
  const shiftType = employee?.defaultShift || 'NORMAL_DAY';
  const checkIn = hhmm(dto.check_in);
  const checkOut = hhmm(dto.check_out);
  const rate = employee?.hourlyRate ?? 0;
  const ot = calculateOvertime(shiftType, checkIn || '08:00', checkOut || '08:00', rate);
  const valid = Boolean(checkIn && checkOut);

  return {
    id: dto.id,
    employeeId: dto.employee_id,
    date: dto.date,
    shiftType,
    checkIn,
    checkOut,
    workingHours: valid ? ot.actualWorkedHours : 0,
    standardHours: ot.standardHours,
    overtimeHoursTotal: valid ? ot.totalOvertimeHours : 0,
    dayOvertimeHours: valid ? ot.dayOvertimeHours : 0,
    nightOvertimeHours: valid ? ot.nightOvertimeHours : 0,
    dayOvertimePay: valid ? ot.dayOvertimePay : 0,
    nightOvertimePay: valid ? ot.nightOvertimePay : 0,
    totalOvertimePay: valid ? ot.totalOvertimePay : 0,
    source: 'ZKTeco-Biometric',
    notes: dto.notes || '',
    status: dto.status as AttendanceRecord['status'],
    isDemo: dto.is_demo,
  };
}

export function attendanceToPayload(record: Omit<AttendanceRecord, 'id'>) {
  const ot = calculateOvertime(record.shiftType, record.checkIn, record.checkOut, 0);
  return {
    employee_id: record.employeeId,
    date: record.date,
    check_in: record.checkIn ? `${record.checkIn}:00` : null,
    check_out: record.checkOut ? `${record.checkOut}:00` : null,
    status: record.status,
    overtime_minutes: Math.round(record.overtimeHoursTotal * 60),
    late_minutes: ot.lateMinutes,
    early_leave_minutes: ot.earlyLeaveMinutes,
    notes: record.notes || '',
  };
}

export function mapLeave(dto: LeaveDto): LeaveRecord {
  return {
    id: dto.id,
    employeeId: dto.employee_id,
    leaveType: dto.leave_type as LeaveRecord['leaveType'],
    startDate: dto.start_date,
    endDate: dto.end_date,
    daysCount: Number(dto.days_count),
    reason: dto.reason || '',
    replacementEmployeeId: dto.replacement_employee_id || undefined,
    status: dto.status as LeaveRecord['status'],
    approvedBy: dto.approved_by || undefined,
    approvalDate: dto.approval_date || undefined,
    notes: dto.notes || '',
    isDemo: dto.is_demo,
  };
}

export function mapBalance(dto: BalanceDto): LeaveBalance {
  return {
    employeeId: dto.employee_id,
    year: dto.year,
    annualOpening: Number(dto.annual_total),
    casualOpening: Number(dto.casual_total),
    sickOpening: Number(dto.sick_total),
    sickCycleStartYear: dto.year,
    annualUsed: Number(dto.annual_used),
    casualUsed: Number(dto.casual_used),
    sickUsed: Number(dto.sick_used),
    otherUsed: 0,
    isDemo: dto.is_demo,
  };
}

export function mapPermit(dto: PermitDto): PermitRecord {
  return {
    id: dto.id,
    employeeId: dto.employee_id,
    permitType: dto.permit_type as PermitRecord['permitType'],
    date: dto.date,
    startTime: hhmm(dto.start_time),
    endTime: hhmm(dto.end_time),
    durationHours: Number(dto.duration_hours),
    reason: dto.reason || '',
    status: dto.status as PermitRecord['status'],
    approvedBy: dto.approved_by || undefined,
    isDemo: dto.is_demo,
  };
}

export function mapMission(dto: MissionDto): MissionRecord {
  return {
    id: dto.id,
    employeeId: dto.employee_id,
    missionType: dto.mission_type as MissionRecord['missionType'],
    destination: dto.destination,
    purpose: dto.purpose || '',
    startDate: dto.start_date,
    endDate: dto.end_date,
    daysCount: Number(dto.days_count),
    allowancePerDay: Number(dto.allowance_per_day),
    totalAllowance: Number(dto.total_allowance),
    transportationType: dto.transportation_type as MissionRecord['transportationType'],
    status: dto.status as MissionRecord['status'],
    approvedBy: dto.approved_by || undefined,
    isDemo: dto.is_demo,
  };
}

export function mapDevice(dto: DeviceDto): ZKTecoDevice {
  return {
    id: dto.id,
    name: dto.name,
    ipAddress: dto.ip_address,
    port: dto.port,
    commKey: 0,
    location: dto.location,
    status: (['connected', 'disconnected', 'syncing', 'error'].includes(dto.status)
      ? dto.status
      : 'disconnected') as ZKTecoDevice['status'],
    deviceModel: dto.model,
    isDemo: dto.is_demo,
  };
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(username: string, password: string): Promise<UserSession> {
  const dto = await request<TokenDto>('/auth/login', {
    method: 'POST',
    auth: false,
    body: { username: username.trim(), password },
  });
  setToken(dto.access_token);
  const session = mapUser(dto.user);
  setStoredSession(session);
  return session;
}

export async function fetchMe(): Promise<UserSession> {
  const dto = await request<UserDto>('/auth/me');
  const session = mapUser(dto);
  setStoredSession(session);
  return session;
}

export function logout(): void {
  setToken(null);
  setStoredSession(null);
}

export async function checkHealth(): Promise<boolean> {
  try {
    await request<{ status: string }>('/health', { auth: false, timeoutMs: 5000 });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function fetchAllPages<T>(path: string, extraParams: Record<string, string> = {}): Promise<T[]> {
  const limit = 500;
  const items: T[] = [];
  for (let offset = 0; offset < 20000; offset += limit) {
    const params = new URLSearchParams({ ...extraParams, limit: String(limit), offset: String(offset) });
    const page = await request<PageDto<T>>(`${path}?${params.toString()}`);
    items.push(...page.items);
    if (page.items.length === 0 || items.length >= page.total) break;
  }
  return items;
}

export async function fetchEmployees(): Promise<Employee[]> {
  const rows = await fetchAllPages<EmployeeDto>('/employees');
  return rows.map((row, index) => mapEmployee(row, index));
}

export async function fetchAttendance(employees: Employee[]): Promise<AttendanceRecord[]> {
  const byId = new Map(employees.map((employee) => [employee.employeeId, employee]));
  const rows = await fetchAllPages<AttendanceDto>('/attendance');
  return rows.map((row) => mapAttendance(row, byId.get(row.employee_id)));
}

export async function fetchLeaves(): Promise<LeaveRecord[]> {
  const rows = await fetchAllPages<LeaveDto>('/leaves');
  return rows.map(mapLeave);
}

export async function fetchLeaveBalances(): Promise<LeaveBalance[]> {
  const rows = await request<BalanceDto[]>('/leave-balances');
  return rows.map(mapBalance);
}

export async function fetchPermits(): Promise<PermitRecord[]> {
  const rows = await request<PermitDto[]>('/permits');
  return rows.map(mapPermit);
}

export async function fetchMissions(): Promise<MissionRecord[]> {
  const rows = await request<MissionDto[]>('/missions');
  return rows.map(mapMission);
}

export async function fetchDevices(): Promise<ZKTecoDevice[]> {
  const rows = await request<DeviceDto[]>('/devices');
  return rows.map(mapDevice);
}

export interface HrSnapshot {
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaveBalances: LeaveBalance[];
  leaves: LeaveRecord[];
  permits: PermitRecord[];
  missions: MissionRecord[];
  devices: ZKTecoDevice[];
}

/** One round of parallel reads. Attendance needs employees for hourly rates. */
export async function fetchAll(): Promise<HrSnapshot> {
  const [employees, leaves, leaveBalances, permits, missions, devices] = await Promise.all([
    fetchEmployees(),
    fetchLeaves(),
    fetchLeaveBalances(),
    fetchPermits(),
    fetchMissions(),
    fetchDevices(),
  ]);
  const attendance = await fetchAttendance(employees);
  return { employees, attendance, leaveBalances, leaves, permits, missions, devices };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createEmployee(payload: Omit<Employee, 'serial'>): Promise<Employee> {
  const dto = await request<EmployeeDto>('/employees', { method: 'POST', body: employeeToPayload(payload) });
  return mapEmployee(dto);
}

export async function updateEmployee(employeeId: string, payload: Omit<Employee, 'serial'>): Promise<Employee> {
  const dto = await request<EmployeeDto>(`/employees/${encodeURIComponent(employeeId)}`, {
    method: 'PATCH',
    body: employeeToPayload(payload),
  });
  return mapEmployee(dto);
}

export async function deactivateEmployee(employeeId: string): Promise<Employee> {
  const dto = await request<EmployeeDto>(`/employees/${encodeURIComponent(employeeId)}`, { method: 'DELETE' });
  return mapEmployee(dto);
}

export async function upsertAttendance(payload: Omit<AttendanceRecord, 'id'>): Promise<void> {
  await request('/attendance', { method: 'POST', body: attendanceToPayload(payload) });
}

export async function createLeave(payload: Omit<LeaveRecord, 'id'>): Promise<LeaveRecord> {
  const dto = await request<LeaveDto>('/leaves', {
    method: 'POST',
    body: {
      employee_id: payload.employeeId,
      leave_type: payload.leaveType,
      start_date: payload.startDate,
      end_date: payload.endDate,
      days_count: payload.daysCount,
      reason: payload.reason || '',
      replacement_employee_id: payload.replacementEmployeeId || null,
      notes: payload.notes || '',
    },
  });
  return mapLeave(dto);
}

export async function decideLeave(leaveId: string, status: 'معتمد' | 'مرفوض'): Promise<LeaveRecord> {
  const dto = await request<LeaveDto>(`/leaves/${leaveId}/decision`, { method: 'POST', body: { status } });
  return mapLeave(dto);
}

export async function createPermit(payload: Omit<PermitRecord, 'id'>): Promise<PermitRecord> {
  const dto = await request<PermitDto>('/permits', {
    method: 'POST',
    body: {
      employee_id: payload.employeeId,
      permit_type: payload.permitType,
      date: payload.date,
      start_time: `${payload.startTime}:00`,
      end_time: `${payload.endTime}:00`,
      duration_hours: payload.durationHours,
      reason: payload.reason,
    },
  });
  return mapPermit(dto);
}

export async function createMission(payload: Omit<MissionRecord, 'id'>): Promise<MissionRecord> {
  const dto = await request<MissionDto>('/missions', {
    method: 'POST',
    body: {
      employee_id: payload.employeeId,
      mission_type: payload.missionType,
      destination: payload.destination,
      purpose: payload.purpose,
      start_date: payload.startDate,
      end_date: payload.endDate,
      days_count: payload.daysCount,
      allowance_per_day: payload.allowancePerDay ?? 450,
      transportation_type: payload.transportationType,
    },
  });
  return mapMission(dto);
}

export async function createDevice(device: ZKTecoDevice): Promise<ZKTecoDevice> {
  const dto = await request<DeviceDto>('/devices', {
    method: 'POST',
    body: {
      name: device.name,
      ip_address: device.ipAddress,
      port: device.port,
      location: device.location,
      model: device.deviceModel || '',
    },
  });
  return mapDevice(dto);
}

export async function updateDevice(device: ZKTecoDevice): Promise<ZKTecoDevice> {
  const dto = await request<DeviceDto>(`/devices/${device.id}`, {
    method: 'PATCH',
    body: {
      name: device.name,
      ip_address: device.ipAddress,
      port: device.port,
      location: device.location,
      model: device.deviceModel || '',
    },
  });
  return mapDevice(dto);
}

export async function deleteDevice(deviceId: string): Promise<void> {
  await request(`/devices/${deviceId}`, { method: 'DELETE' });
}
