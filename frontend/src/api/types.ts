// Backend (Django REST) javoblariga mos turlar

export type TaskStatusValue =
  | "BACKLOG" | "TODO" | "IN_PROGRESS" | "IN_REVIEW"
  | "CHANGES_REQUESTED" | "BLOCKED" | "DONE" | "CANCELLED";

export type ProjectRoleValue = "MANAGER" | "ADMIN" | "DEVELOPER" | "QA" | "VIEWER";
export type GlobalRoleValue = "ADMIN" | "MANAGER" | "DEVELOPER";
export type VerdictValue = "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";

export interface UserBrief {
  id: number;
  full_name: string;
  email: string;
  is_platform_admin: boolean;
  job_title: string;
  initials: string;
  avatar_color: string;
  avatar: string | null;
  specialty: string;
  specialty_display: string;
  specialty_icon: string;
  specialty_color: string;
  seniority: string;
  seniority_display: string;
}

export interface User extends UserBrief {
  global_role: GlobalRoleValue;
  global_role_display: string;
  bio: string;
  skills: string;
  skill_list: string[];
  github_username: string;
  telegram: string;
  is_active: boolean;
  date_joined: string;
  years_experience: number;
  suggested_task_types: string[];
  suggested_skills: string[];
  quality_checklist: string[];
  default_project_role: string;
  /** Loyiha va ish maydoni ocha oladimi - faqat menejer va admin */
  can_create_project: boolean;
  project_count?: number;
  open_tasks?: number;
}

export interface Access {
  role: ProjectRoleValue | null;
  role_label: string;
  is_admin: boolean;
  is_project_admin: boolean;
  can_delete_task: boolean;
  can_appoint_admin: boolean;
  can_grant_manager: boolean;
  is_manager: boolean;
  is_member: boolean;
  can_view: boolean;
  can_manage: boolean;
  can_create_task: boolean;
  can_review: boolean;
  can_work: boolean;
}

export interface Workspace {
  id: number;
  name: string;
  slug: string;
  description: string;
  color: string;
  owner: UserBrief;
  join_code: string;
  is_open: boolean;
  created_at: string;
  member_count: number;
  project_count: number;
  my_role: string | null;
  can_manage: boolean;
  members?: WorkspaceMember[];
}

export interface WorkspaceMember {
  id: number;
  user: UserBrief;
  role: string;
  role_display: string;
  joined_at: string;
}

export interface Project {
  id: number;
  workspace: number;
  workspace_name: string;
  workspace_slug: string;
  name: string;
  key: string;
  description: string;
  status: string;
  status_display: string;
  color: string;
  manager: UserBrief | null;
  created_by: UserBrief | null;
  repo_url: string;
  docs_url: string;
  start_date: string | null;
  due_date: string | null;
  is_public: boolean;
  join_code: string;
  auto_accept: boolean;
  created_at: string;
  updated_at: string;
  member_count: number;
  open_tasks: number;
  done_tasks: number;
  my_tasks: number;
  progress: number;
  access: Access;
  needed_specialties: string[];
  needed_specialty_labels: { value: string; label: string }[];
  team_composition: { value: string; label: string; count: number }[];
  specialty_gaps: { value: string; label: string }[];
  matches_my_specialty: boolean;
  brief?: Brief;
  members?: ProjectMember[];
  status_counts?: Record<string, number>;
  pending_requests?: number;
}

export interface ProjectMember {
  id: number;
  user: UserBrief;
  role: ProjectRoleValue;
  role_display: string;
  is_active: boolean;
  joined_at: string;
  left_at: string | null;
  handover_note: string;
  load?: { open: number; done: number };
}

export interface JoinRequest {
  id: number;
  project: number;
  project_name: string;
  user: UserBrief;
  message: string;
  desired_role: ProjectRoleValue;
  desired_role_display: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  status_display: string;
  decided_by: UserBrief | null;
  decided_at: string | null;
  decision_note: string;
  created_at: string;
}

export interface Brief {
  goal: string;
  tech_stack: string;
  architecture: string;
  setup_steps: string;
  conventions: string;
  definition_of_done: string;
  pitfalls: string;
  contacts: string;
  updated_by: UserBrief | null;
  updated_at: string;
  filled_ratio: number;
}

export interface Label {
  id: number;
  name: string;
  color: string;
}

export interface Task {
  id: number;
  project: number;
  project_name: string;
  project_key: string;
  number: number;
  code: string;
  title: string;
  description: string;
  acceptance_criteria: string;
  status: TaskStatusValue;
  status_display: string;
  priority: 1 | 2 | 3 | 4;
  priority_label: string;
  task_type: string;
  type_display: string;
  created_by: UserBrief | null;
  reviewer: UserBrief | null;
  parent: number | null;
  labels: Label[];
  assignees: UserBrief[];
  start_date: string | null;
  due_date: string | null;
  estimate_hours: string | null;
  branch_name: string;
  pr_url: string;
  blocked_reason: string;
  review_round: number;
  is_overdue: boolean;
  logged_hours: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  required_specialty: string;
  specialty_label: string;
  attachment_count: number;
  comments?: Comment[];
  reviews?: Review[];
  worklogs?: WorkLog[];
  attachments?: Attachment[];
  subtasks?: Task[];
  allowed_transitions?: { value: TaskStatusValue; label: string }[];
  access?: Access;
  suitable_members?: UserBrief[];
  mismatched_assignees?: UserBrief[];
  quality_checklist?: string[];
}

export interface Attachment {
  id: number;
  file: string;
  url: string;
  original_name: string;
  size: number;
  size_display: string;
  content_type: string;
  description: string;
  extension: string;
  is_image: boolean;
  uploaded_by: UserBrief | null;
  created_at: string;
}

export interface Comment {
  id: number;
  author: UserBrief | null;
  body: string;
  created_at: string;
  edited_at: string | null;
}

export interface Review {
  id: number;
  reviewer: UserBrief | null;
  verdict: VerdictValue;
  verdict_display: string;
  comment: string;
  round_no: number;
  created_at: string;
  task?: number;
  task_code?: string;
  task_title?: string;
}

export interface WorkLog {
  id: number;
  user: UserBrief;
  hours: string;
  note: string;
  work_date: string;
  created_at: string;
  task?: number;
  task_code?: string;
  task_title?: string;
}

export interface Activity {
  id: number;
  verb: string;
  summary: string;
  detail: string;
  meta: Record<string, unknown>;
  target_label: string;
  icon: string;
  category: string;
  actor: UserBrief | null;
  project: number | null;
  project_name: string | null;
  task: number | null;
  task_code: string | null;
  created_at: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Yon paneldagi uchta raqam (`/counts/`) - panelning yengil versiyasi. */
export interface SidebarCounts {
  open: number;
  reviews: number;
  joins: number;
}

/** Menejer jamoasidagi bitta odam: qaysi loyihalarda va qancha ish bilan. */
export interface TeamPerson {
  user: UserBrief;
  role_label: string;
  projects: { id: number; name: string; key: string; color: string }[];
  open_tasks: number;
  review_tasks: number;
  done_tasks: number;
}

export interface DashboardData {
  stats: {
    open: number; review: number; returned: number;
    overdue: number; done_week: number;
    pending_reviews: number; pending_joins: number;
  };
  /** Bugungi kesim: bajarish kerak, bajarildi, tekshiruvga topshirildi */
  today: { date: string; todo: number; done: number; review: number };
  /** Menejer kesimi - boshqaruvdagi loyihalar va ulardagi odamlar */
  team: {
    projects: number;
    developers: number;
    pending_reviews: number;
    people: TeamPerson[];
  };
  next_task: Task | null;
  focus_queue: Task[];
  returned: Task[];
  blocked: Task[];
  waiting_review: Task[];
  my_projects: Project[];
  managed_projects: Project[];
  review_queue: Task[];
  join_queue: JoinRequest[];
  feed: Activity[];
}

export interface MyWorkData {
  groups: { status: TaskStatusValue; label: string; count: number; tasks: Task[] }[];
  projects: { id: number; name: string; key: string; color: string }[];
}

export interface OnboardingData {
  project: {
    id: number; name: string; key: string; description: string; color: string;
    repo_url: string; docs_url: string; progress: number; manager: UserBrief | null;
  };
  brief: Brief | null;
  contributions: {
    member: ProjectMember; done: number; open: number;
    hours: string | number; last_active: string | null;
  }[];
  key_notes: WorkLog[];
  lessons: Review[];
  recent_done: Task[];
  open_now: Task[];
  milestones: Activity[];
}

export interface DeveloperReport {
  developer: UserBrief;
  membership: ProjectMember | null;
  task_count: number;
  by_status: Record<string, number>;
  done_count: number;
  total_hours: string | number;
  done_tasks: Task[];
  open_tasks: Task[];
  worklogs: WorkLog[];
  reviews: Review[];
  review_map: Record<string, number>;
  timeline: Activity[];
}

export interface SpecialtyInfo {
  value: string;
  label: string;
  icon: string;
  color: string;
  skills: string[];
  task_types: string[];
  default_project_role: string;
  focus: string;
  checklist: string[];
}

export interface MetaData {
  specialties: SpecialtyInfo[];
  seniority: Choice[];
  task_status: Choice[];
  board_columns: Choice[];
  task_priority: Choice[];
  task_type: Choice[];
  review_verdict: Choice[];
  project_role: Choice[];
  project_status: Choice[];
  workspace_role: Choice[];
  global_role: Choice[];
  /** Tarix filtri turkumlari - backenddagi `VERB_META` dan */
  activity_category: Choice[];
}

export interface Choice {
  value: string | number;
  label: string;
}

/* ------------------------------------------------ Bildirishnoma va chat */

/* Qo'ng'iroqqa faqat javob talab qiladigan narsa tushadi: o'z vazifang,
   senga yozilgan xabar va qo'shilish so'rovi. Qolgani tarixda. */
export type NotificationKind =
  | "task.assigned" | "task.review" | "task.decided" | "task.comment"
  | "chat.message" | "chat.direct"
  | "join.request"
  | "project.deadline";

export interface AppNotification {
  id: number;
  kind: NotificationKind;
  kind_display: string;
  title: string;
  body: string;
  url: string;
  meta: Record<string, unknown>;
  is_read: boolean;
  actor: UserBrief | null;
  created_at: string;
}

/* ------------------------------------------------ Taqvim */

/** Taqvimdagi bitta tasma: loyiha yoki vazifa. `from`/`to` - oy ichidagi
    ko'rinadigan qismi, `start_date`/`due_date` - haqiqiy sanalari. */
interface CalendarSpan {
  from: string;
  to: string;
  start_date: string | null;
  due_date: string | null;
  starts_here: boolean;
  ends_here: boolean;
  overdue: boolean;
}

export interface CalendarProject extends CalendarSpan {
  id: number;
  name: string;
  key: string;
  color: string;
  status: string;
  status_display: string;
  is_public: boolean;
  manager_name: string;
  progress: number;
  /** Muddat qo'yilmagan - tasma ochiq qoladi */
  open_ended: boolean;
  /** Boshlanish sanasi kiritilmagan, ochilgan kuni olingan */
  start_assumed: boolean;
}

export interface CalendarTask extends CalendarSpan {
  id: number;
  code: string;
  title: string;
  status: string;
  status_display: string;
  priority: number;
  project: { id: number; name: string; key: string; color: string };
  assignees: UserBrief[];
  done: boolean;
}

/** `GET /api/projects/calendar/?month=YYYY-MM` javobi */
export interface CalendarMonth {
  month: string;
  first_day: string;
  last_day: string;
  today: string;
  projects: CalendarProject[];
  tasks: CalendarTask[];
  days: { date: string; count: number }[];
  total: number;
  task_total: number;
}

/** Ochiq (autentifikatsiyasiz) API dan keladigan loyiha - faqat xavfsiz maydonlar */
export interface PublicProject {
  id: number;
  name: string;
  key: string;
  description: string;
  color: string;
  status: string;
  status_display: string;
  workspace_name: string;
  manager_name: string;
  needed_specialties: { value: string; label: string }[];
  member_count: number | null;
  open_tasks: number | null;
  done_tasks: number | null;
  progress: number;
  created_at: string;
  specialty_gaps?: { value: string; label: string }[];
  team_composition?: { value: string; label: string; count: number }[];
}

/** Hujjatning eski nusxasi - almashtirilganda saqlanib qoladi */
/** Maydonlar bo'yicha solishtirish qatori (`apps/core/textdiff.field_diff`). */
export interface DiffRow {
  key: string;
  label: string;
  old: string;
  new: string;
  changed: boolean;
}

export interface ProjectFileVersion {
  id: number;
  version: number;
  url: string | null;
  original_name: string;
  size: number;
  size_display: string;
  content_type: string;
  description: string;
  /** Hujjatning o'zidagi sana, "YYYY-MM-DD" — yuklangan vaqt emas */
  doc_date: string | null;
  is_image: boolean;
  uploaded_by: UserBrief | null;
  created_at: string;
  replaced_by: UserBrief | null;
  replaced_at: string;
  /** Shu nusxa o'zidan keyingi holatga aylanganda nima o'zgargani. */
  diff: DiffRow[];
}

export interface ProjectFile {
  id: number;
  file: string;
  url: string | null;
  original_name: string;
  size: number;
  size_display: string;
  content_type: string;
  description: string;
  /** Hujjatning o'zidagi sana, "YYYY-MM-DD" — yuklangan vaqt emas */
  doc_date: string | null;
  extension: string;
  is_image: boolean;
  uploaded_by: UserBrief | null;
  /** Nechanchi nusxa: 1 - hech qachon almashtirilmagan */
  version: number;
  /** Eski nusxalar, yangisi tepada */
  versions: ProjectFileVersion[];
  created_at: string;
  updated_at: string;
}

/** Solishtirishdagi bitta bo'lak. `changed` bo'lsa interfeys uni ajratadi. */
export interface DiffPiece {
  text: string;
  changed: boolean;
}

/** Server hisoblab bergan solishtirish (`apps/core/textdiff.py`). */
export interface TextDiff {
  old: DiffPiece[];
  new: DiffPiece[];
  has_changes: boolean;
  /** Matn juda uzun bo'lsa bo'laklarga bo'linmaydi - butunicha belgilanadi. */
  truncated?: boolean;
}

export interface SubmissionEdit {
  id: number;
  editor: UserBrief | null;
  old_text: string;
  new_text: string;
  edited_at: string;
  diff: TextDiff;
}

/** Dasturchining ish topshirig'i */
export interface Submission {
  id: number;
  task: number;
  author: UserBrief;
  round_no: number;
  text: string;
  files: Attachment[];
  edits: SubmissionEdit[];
  is_edited: boolean;
  edited_count: number;
  can_edit: boolean;
  created_at: string;
  updated_at: string;
}

/** Odamning bitta ochiq vazifasi - qachon boshlanib qachon tugashi */
export interface ForecastTask {
  id: number;
  code: string;
  title: string;
  status: string;
  status_display: string;
  start_date: string | null;
  due_date: string | null;
  overdue: boolean;
}

export interface ForecastRow {
  user: UserBrief;
  role: string;
  open: number;
  done: number;
  in_review: number;
  overdue: number;
  /** Kiritilgan eng erta boshlanish va eng kech muddat */
  first_start: string | null;
  last_due: string | null;
  late: boolean;
  /** Ochiq vazifalar, eng yaqin muddat tepada */
  tasks: ForecastTask[];
}

/** `GET /api/projects/:id/forecast/` javobi */
export interface Forecast {
  today: string;
  members: ForecastRow[];
  project: {
    open: number;
    done: number;
    unassigned: number;
    overdue: number;
    start_date: string | null;
    due_date: string | null;
    task_start: string | null;
    task_due: string | null;
    at_risk: boolean;
  };
}

export interface ChatMessage {
  id: number;
  scope: "workspace" | "project" | "direct";
  project: number | null;
  workspace: number | null;
  author: UserBrief;
  /** Shaxsiy yozishmada - kimga yozilgani */
  recipient: UserBrief | null;
  text: string;
  created_at: string;
}

/** Shaxsiy yozishmalar ro'yxatidagi bitta qator */
export interface Conversation {
  partner: UserBrief;
  last_message: string;
  last_at: string;
  outgoing: boolean;
}

/** `GET /api/counts/` javobi - yon paneldagi uchta raqam. */
export interface SidebarCounts {
  /** menga biriktirilgan ochiq vazifalar (TODO + jarayonda) */
  open: number;
  /** men tekshirishim kerak bo'lgan vazifalar */
  reviews: number;
  /** javob kutayotgan qo'shilish so'rovlari */
  joins: number;
}

/** `GET /api/users/:id/work/` javobi */
export interface UserWork {
  user: UserBrief;
  stats: {
    projects: number; open: number; done: number;
    in_review: number; changes: number; hours: number;
  };
  projects: {
    id: number; name: string; key: string; color: string;
    workspace_name: string; role: string;
  }[];
  tasks: Task[];
  activity: Activity[];
  /** true bo'lsa - ro'yxat so'rovchining huquqi bilan cheklangan */
  limited: boolean;
}
