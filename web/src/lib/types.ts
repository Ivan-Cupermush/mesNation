/** Типы данных сервера (то, что реально отдаёт API в server/src/routes). */

export interface UserShort {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_active?: boolean;
}

export interface Profile extends UserShort {
  email: string | null;
  created_at: string;
  role_id: number | null;
  role_name: string | null;
  role_color: string | null;
  role_icon: string | null;
  is_director: boolean;
  role_depth: number | null;
  has_subordinates: boolean;
  company_name: string | null;
  can_manage?: boolean;
}

export interface Employee extends UserShort {
  email: string | null;
  is_active: boolean;
  deactivated_at: string | null;
  created_at: string;
  role_node_id: number | null;
  role_name: string | null;
  role_color: string | null;
  role_icon: string | null;
  is_director: boolean;
}

export interface AssignableUser extends UserShort {
  role_node_id: number | null;
  role_name: string | null;
  role_color: string | null;
}

export interface Presence {
  user_id: number;
  online: boolean;
  last_seen_at: string | null;
}
