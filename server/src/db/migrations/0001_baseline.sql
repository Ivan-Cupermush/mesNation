-- Эталонная схема БД (снята с рабочей базы проекта, 2026-10-04).
-- Применяется ТОЛЬКО к пустой базе. На существующих базах раннер
-- помечает её применённой автоматически (см. src/db/migrate.ts).



CREATE FUNCTION public.update_chat_sessions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE chat_sessions 
    SET updated_at = NOW() 
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$;

CREATE TABLE public.app_settings (
    key character varying(100) NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.chat_admins (
    chat_id integer NOT NULL,
    user_id integer NOT NULL,
    promoted_by integer,
    promoted_at timestamp with time zone DEFAULT now(),
    permissions text[] DEFAULT '{}'::text[]
);

CREATE TABLE public.chat_members (
    chat_id integer NOT NULL,
    user_id integer NOT NULL,
    joined_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.chat_messages (
    id integer NOT NULL,
    session_id integer NOT NULL,
    role character varying(20) NOT NULL,
    content text NOT NULL,
    source_chunk_ids integer[] DEFAULT '{}'::integer[],
    feedback character varying(10),
    feedback_comment text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_feedback CHECK (((feedback IS NULL) OR ((feedback)::text = ANY (ARRAY[('positive'::character varying)::text, ('negative'::character varying)::text])))),
    CONSTRAINT valid_msg_role CHECK (((role)::text = ANY (ARRAY[('user'::character varying)::text, ('assistant'::character varying)::text, ('system'::character varying)::text])))
);

CREATE SEQUENCE public.chat_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.chat_messages_id_seq OWNED BY public.chat_messages.id;

CREATE TABLE public.chat_sessions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    title character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.chat_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.chat_sessions_id_seq OWNED BY public.chat_sessions.id;

CREATE TABLE public.chats (
    id integer NOT NULL,
    name character varying(255),
    type character varying(20) DEFAULT 'group'::character varying NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    is_supergroup boolean DEFAULT false,
    avatar_url text,
    CONSTRAINT chats_type_check CHECK (((type)::text = ANY (ARRAY[('private'::character varying)::text, ('group'::character varying)::text])))
);

CREATE SEQUENCE public.chats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.chats_id_seq OWNED BY public.chats.id;

CREATE TABLE public.departments (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    parent_id integer,
    color character varying(7) DEFAULT '#3498db'::character varying
);

CREATE SEQUENCE public.departments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.departments_id_seq OWNED BY public.departments.id;

CREATE TABLE public.messages (
    id integer NOT NULL,
    chat_id character varying(255) NOT NULL,
    sender_id integer DEFAULT 0,
    text text,
    file_url text,
    file_name text,
    created_at timestamp with time zone DEFAULT now(),
    reply_to_message_id integer,
    edited_at timestamp with time zone,
    deleted_for_user_ids integer[] DEFAULT '{}'::integer[],
    deleted_for_all boolean DEFAULT false,
    topic_id integer,
    thumb_url text,
    pinned boolean DEFAULT false,
    external_reply_chat_id integer,
    content_type character varying(20) DEFAULT 'text'::character varying,
    poll_id integer
);

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;

CREATE TABLE public.notes (
    id integer NOT NULL,
    user_id integer NOT NULL,
    title character varying(255) DEFAULT ''::character varying,
    content text DEFAULT ''::text,
    is_favorite boolean DEFAULT false,
    task_id integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    note_date date DEFAULT CURRENT_DATE NOT NULL
);

CREATE SEQUENCE public.notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.notes_id_seq OWNED BY public.notes.id;

CREATE TABLE public.poll_options (
    id integer NOT NULL,
    poll_id integer NOT NULL,
    option_index integer NOT NULL,
    text text NOT NULL,
    is_correct boolean DEFAULT false
);

CREATE SEQUENCE public.poll_options_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.poll_options_id_seq OWNED BY public.poll_options.id;

CREATE TABLE public.poll_votes (
    id integer NOT NULL,
    poll_id integer NOT NULL,
    option_id integer NOT NULL,
    user_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.poll_votes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.poll_votes_id_seq OWNED BY public.poll_votes.id;

CREATE TABLE public.polls (
    id integer NOT NULL,
    chat_id integer NOT NULL,
    topic_id integer,
    creator_id integer NOT NULL,
    question text NOT NULL,
    is_anonymous boolean DEFAULT false,
    allows_multiple boolean DEFAULT false,
    is_quiz boolean DEFAULT false,
    correct_option_index integer,
    is_closed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.polls_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.polls_id_seq OWNED BY public.polls.id;

CREATE TABLE public.role_tree (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    parent_id integer,
    description text,
    level integer DEFAULT 0,
    color character varying(7),
    icon character varying(10),
    created_by integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.roles (
    id integer NOT NULL,
    name character varying(50) NOT NULL
);

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.roles_id_seq OWNED BY public.role_tree.id;

CREATE SEQUENCE public.roles_id_seq1
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.roles_id_seq1 OWNED BY public.roles.id;

CREATE TABLE public.sales_imports (
    id integer NOT NULL,
    user_id integer NOT NULL,
    file_name character varying(255) NOT NULL,
    file_size integer,
    total_rows integer DEFAULT 0,
    imported_rows integer DEFAULT 0,
    skipped_rows integer DEFAULT 0,
    total_amount numeric(15,2) DEFAULT 0,
    status character varying(20) DEFAULT 'pending'::character varying,
    error_log jsonb,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);

CREATE SEQUENCE public.sales_imports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.sales_imports_id_seq OWNED BY public.sales_imports.id;

CREATE TABLE public.sales_targets (
    id integer NOT NULL,
    user_id integer NOT NULL,
    is_department_target boolean DEFAULT false,
    department_id integer,
    product_name character varying(255),
    metric_type character varying(50) DEFAULT 'quantity'::character varying,
    target_value numeric(15,2) NOT NULL,
    current_value numeric(15,2) DEFAULT 0,
    period_start date DEFAULT CURRENT_DATE NOT NULL,
    period_end date DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon -1 days'::interval) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.sales_targets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.sales_targets_id_seq OWNED BY public.sales_targets.id;

CREATE TABLE public.sales_transactions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    target_id integer,
    product_name character varying(255) NOT NULL,
    quantity numeric(15,2) DEFAULT 1,
    amount numeric(15,2) DEFAULT 0,
    transaction_date date DEFAULT CURRENT_DATE NOT NULL,
    client_name character varying(255),
    notes text,
    import_id integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.sales_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.sales_transactions_id_seq OWNED BY public.sales_transactions.id;

CREATE TABLE public.task_assignees (
    task_id integer NOT NULL,
    user_id integer NOT NULL,
    assigned_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.task_canvas_posts (
    id integer NOT NULL,
    task_id integer NOT NULL,
    author_id integer NOT NULL,
    content text NOT NULL,
    content_type character varying(20) DEFAULT 'text'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT task_canvas_posts_content_type_check CHECK (((content_type)::text = ANY (ARRAY[('text'::character varying)::text, ('checklist'::character varying)::text, ('image'::character varying)::text])))
);

CREATE SEQUENCE public.task_canvas_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.task_canvas_posts_id_seq OWNED BY public.task_canvas_posts.id;

CREATE TABLE public.task_checkpoints (
    id integer NOT NULL,
    task_id integer NOT NULL,
    title character varying(255) NOT NULL,
    deadline timestamp with time zone NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT task_checkpoints_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('completed'::character varying)::text, ('missed'::character varying)::text])))
);

CREATE SEQUENCE public.task_checkpoints_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.task_checkpoints_id_seq OWNED BY public.task_checkpoints.id;

CREATE TABLE public.task_files (
    id integer NOT NULL,
    task_id integer NOT NULL,
    file_url text NOT NULL,
    file_name character varying(255),
    file_size integer,
    mime_type character varying(100),
    uploaded_by integer,
    uploaded_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.task_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.task_files_id_seq OWNED BY public.task_files.id;

CREATE TABLE public.task_status_history (
    id integer NOT NULL,
    task_id integer NOT NULL,
    from_status character varying(20),
    to_status character varying(20) NOT NULL,
    changed_by integer NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.task_status_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.task_status_history_id_seq OWNED BY public.task_status_history.id;

CREATE TABLE public.task_watchers (
    task_id integer NOT NULL,
    user_id integer NOT NULL
);

CREATE TABLE public.tasks (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    deadline timestamp without time zone,
    status character varying(50) DEFAULT 'active'::character varying,
    creator_id integer,
    assignee_id integer,
    department_id integer,
    created_at timestamp without time zone DEFAULT now(),
    importance character varying(10) DEFAULT 'yellow'::character varying,
    hard_deadline timestamp with time zone,
    status_new character varying(20) DEFAULT 'new'::character varying,
    watcher_id integer,
    executor_comment text,
    watcher_comment text,
    archived_as character varying(20),
    updated_at timestamp with time zone DEFAULT now(),
    executor_deadline timestamp with time zone,
    reviewer_deadline timestamp with time zone,
    archived_at timestamp with time zone,
    CONSTRAINT tasks_importance_check CHECK (((importance)::text = ANY (ARRAY[('green'::character varying)::text, ('yellow'::character varying)::text, ('red'::character varying)::text]))),
    CONSTRAINT tasks_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('done'::character varying)::text, ('overdue'::character varying)::text]))),
    CONSTRAINT tasks_status_new_check CHECK (((status_new)::text = ANY (ARRAY[('new'::character varying)::text, ('in_progress'::character varying)::text, ('on_review'::character varying)::text, ('done'::character varying)::text, ('overdue'::character varying)::text, ('rejected'::character varying)::text, ('archived'::character varying)::text])))
);

CREATE SEQUENCE public.tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.tasks_id_seq OWNED BY public.tasks.id;

CREATE TABLE public.topics (
    id integer NOT NULL,
    chat_id integer,
    title character varying(255) NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    icon character varying(50) DEFAULT 'hash'::character varying,
    icon_color character varying(20) DEFAULT '#1F7A52'::character varying,
    icon_opacity real DEFAULT 1
);

CREATE SEQUENCE public.topics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.topics_id_seq OWNED BY public.topics.id;

CREATE TABLE public.user_role_assignments (
    id integer NOT NULL,
    user_id integer NOT NULL,
    role_node_id integer NOT NULL,
    assigned_by integer,
    assigned_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.user_role_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.user_role_assignments_id_seq OWNED BY public.user_role_assignments.id;

CREATE TABLE public.users (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(50),
    department_id integer,
    sales_plan numeric(15,2) DEFAULT 0,
    username character varying(100),
    display_name character varying(255),
    avatar_url character varying(500),
    role_id integer,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY (ARRAY[('director'::character varying)::text, ('manager'::character varying)::text, ('employee'::character varying)::text])))
);

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;

ALTER TABLE ONLY public.chat_messages ALTER COLUMN id SET DEFAULT nextval('public.chat_messages_id_seq'::regclass);

ALTER TABLE ONLY public.chat_sessions ALTER COLUMN id SET DEFAULT nextval('public.chat_sessions_id_seq'::regclass);

ALTER TABLE ONLY public.chats ALTER COLUMN id SET DEFAULT nextval('public.chats_id_seq'::regclass);

ALTER TABLE ONLY public.departments ALTER COLUMN id SET DEFAULT nextval('public.departments_id_seq'::regclass);

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);

ALTER TABLE ONLY public.notes ALTER COLUMN id SET DEFAULT nextval('public.notes_id_seq'::regclass);

ALTER TABLE ONLY public.poll_options ALTER COLUMN id SET DEFAULT nextval('public.poll_options_id_seq'::regclass);

ALTER TABLE ONLY public.poll_votes ALTER COLUMN id SET DEFAULT nextval('public.poll_votes_id_seq'::regclass);

ALTER TABLE ONLY public.polls ALTER COLUMN id SET DEFAULT nextval('public.polls_id_seq'::regclass);

ALTER TABLE ONLY public.role_tree ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq1'::regclass);

ALTER TABLE ONLY public.sales_imports ALTER COLUMN id SET DEFAULT nextval('public.sales_imports_id_seq'::regclass);

ALTER TABLE ONLY public.sales_targets ALTER COLUMN id SET DEFAULT nextval('public.sales_targets_id_seq'::regclass);

ALTER TABLE ONLY public.sales_transactions ALTER COLUMN id SET DEFAULT nextval('public.sales_transactions_id_seq'::regclass);

ALTER TABLE ONLY public.task_canvas_posts ALTER COLUMN id SET DEFAULT nextval('public.task_canvas_posts_id_seq'::regclass);

ALTER TABLE ONLY public.task_checkpoints ALTER COLUMN id SET DEFAULT nextval('public.task_checkpoints_id_seq'::regclass);

ALTER TABLE ONLY public.task_files ALTER COLUMN id SET DEFAULT nextval('public.task_files_id_seq'::regclass);

ALTER TABLE ONLY public.task_status_history ALTER COLUMN id SET DEFAULT nextval('public.task_status_history_id_seq'::regclass);

ALTER TABLE ONLY public.tasks ALTER COLUMN id SET DEFAULT nextval('public.tasks_id_seq'::regclass);

ALTER TABLE ONLY public.topics ALTER COLUMN id SET DEFAULT nextval('public.topics_id_seq'::regclass);

ALTER TABLE ONLY public.user_role_assignments ALTER COLUMN id SET DEFAULT nextval('public.user_role_assignments_id_seq'::regclass);

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.chat_admins
    ADD CONSTRAINT chat_admins_pkey PRIMARY KEY (chat_id, user_id);

ALTER TABLE ONLY public.chat_members
    ADD CONSTRAINT chat_members_pkey PRIMARY KEY (chat_id, user_id);

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.poll_options
    ADD CONSTRAINT poll_options_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.poll_options
    ADD CONSTRAINT poll_options_poll_id_option_index_key UNIQUE (poll_id, option_index);

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_poll_id_option_id_user_id_key UNIQUE (poll_id, option_id, user_id);

ALTER TABLE ONLY public.polls
    ADD CONSTRAINT polls_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.role_tree
    ADD CONSTRAINT roles_name_key UNIQUE (name);

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key1 UNIQUE (name);

ALTER TABLE ONLY public.role_tree
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey1 PRIMARY KEY (id);

ALTER TABLE ONLY public.sales_imports
    ADD CONSTRAINT sales_imports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sales_targets
    ADD CONSTRAINT sales_targets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sales_transactions
    ADD CONSTRAINT sales_transactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_assignees
    ADD CONSTRAINT task_assignees_pkey PRIMARY KEY (task_id, user_id);

ALTER TABLE ONLY public.task_canvas_posts
    ADD CONSTRAINT task_canvas_posts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_checkpoints
    ADD CONSTRAINT task_checkpoints_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_files
    ADD CONSTRAINT task_files_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_status_history
    ADD CONSTRAINT task_status_history_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_watchers
    ADD CONSTRAINT task_watchers_pkey PRIMARY KEY (task_id, user_id);

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_role_assignments
    ADD CONSTRAINT user_role_assignments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_role_assignments
    ADD CONSTRAINT user_role_assignments_user_id_key UNIQUE (user_id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);

CREATE INDEX idx_canvas_created ON public.task_canvas_posts USING btree (created_at);

CREATE INDEX idx_canvas_task ON public.task_canvas_posts USING btree (task_id);

CREATE INDEX idx_chat_messages_created ON public.chat_messages USING btree (created_at);

CREATE INDEX idx_chat_messages_session ON public.chat_messages USING btree (session_id);

CREATE INDEX idx_chat_sessions_updated ON public.chat_sessions USING btree (updated_at DESC);

CREATE INDEX idx_chat_sessions_user ON public.chat_sessions USING btree (user_id);

CREATE INDEX idx_checkpoints_deadline ON public.task_checkpoints USING btree (deadline);

CREATE INDEX idx_checkpoints_task ON public.task_checkpoints USING btree (task_id);

CREATE INDEX idx_notes_favorite ON public.notes USING btree (user_id, is_favorite) WHERE (is_favorite = true);

CREATE INDEX idx_notes_task_id ON public.notes USING btree (task_id) WHERE (task_id IS NOT NULL);

CREATE INDEX idx_notes_user_date ON public.notes USING btree (user_id, note_date);

CREATE INDEX idx_notes_user_id ON public.notes USING btree (user_id);

CREATE INDEX idx_poll_options_poll ON public.poll_options USING btree (poll_id);

CREATE INDEX idx_poll_votes_poll ON public.poll_votes USING btree (poll_id);

CREATE INDEX idx_polls_chat ON public.polls USING btree (chat_id);

CREATE INDEX idx_role_tree_parent ON public.role_tree USING btree (parent_id);

CREATE INDEX idx_sales_imports_user ON public.sales_imports USING btree (user_id);

CREATE INDEX idx_sales_targets_dept ON public.sales_targets USING btree (department_id) WHERE (is_department_target = true);

CREATE INDEX idx_sales_targets_period ON public.sales_targets USING btree (period_start, period_end);

CREATE INDEX idx_sales_targets_user ON public.sales_targets USING btree (user_id);

CREATE INDEX idx_sales_transactions_date ON public.sales_transactions USING btree (transaction_date);

CREATE INDEX idx_sales_transactions_import ON public.sales_transactions USING btree (import_id);

CREATE INDEX idx_sales_transactions_target ON public.sales_transactions USING btree (target_id);

CREATE INDEX idx_sales_transactions_user ON public.sales_transactions USING btree (user_id);

CREATE INDEX idx_task_files_task ON public.task_files USING btree (task_id);

CREATE INDEX idx_task_status_history_created_at ON public.task_status_history USING btree (created_at DESC);

CREATE INDEX idx_task_status_history_task_id ON public.task_status_history USING btree (task_id);

CREATE INDEX idx_tasks_archived_at ON public.tasks USING btree (archived_at) WHERE (archived_at IS NOT NULL);

CREATE INDEX idx_tasks_creator ON public.tasks USING btree (creator_id);

CREATE INDEX idx_tasks_deadline ON public.tasks USING btree (hard_deadline);

CREATE INDEX idx_tasks_executor_deadline ON public.tasks USING btree (executor_deadline);

CREATE INDEX idx_tasks_importance ON public.tasks USING btree (importance);

CREATE INDEX idx_tasks_reviewer_deadline ON public.tasks USING btree (reviewer_deadline);

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status_new);

CREATE INDEX idx_user_role_node ON public.user_role_assignments USING btree (role_node_id);

CREATE TRIGGER trigger_update_chat_sessions_updated_at AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.update_chat_sessions_updated_at();

ALTER TABLE ONLY public.chat_admins
    ADD CONSTRAINT chat_admins_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_admins
    ADD CONSTRAINT chat_admins_promoted_by_fkey FOREIGN KEY (promoted_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.chat_admins
    ADD CONSTRAINT chat_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_members
    ADD CONSTRAINT chat_members_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_members
    ADD CONSTRAINT chat_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chats
    ADD CONSTRAINT chats_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.departments(id);

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.polls(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.poll_options
    ADD CONSTRAINT poll_options_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.polls(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.poll_options(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.polls(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.polls
    ADD CONSTRAINT polls_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.polls
    ADD CONSTRAINT polls_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.polls
    ADD CONSTRAINT polls_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.role_tree
    ADD CONSTRAINT role_tree_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.role_tree
    ADD CONSTRAINT role_tree_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.role_tree(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.sales_imports
    ADD CONSTRAINT sales_imports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sales_targets
    ADD CONSTRAINT sales_targets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sales_transactions
    ADD CONSTRAINT sales_transactions_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.sales_targets(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.sales_transactions
    ADD CONSTRAINT sales_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_assignees
    ADD CONSTRAINT task_assignees_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_assignees
    ADD CONSTRAINT task_assignees_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_canvas_posts
    ADD CONSTRAINT task_canvas_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_canvas_posts
    ADD CONSTRAINT task_canvas_posts_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_checkpoints
    ADD CONSTRAINT task_checkpoints_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_files
    ADD CONSTRAINT task_files_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_files
    ADD CONSTRAINT task_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.task_status_history
    ADD CONSTRAINT task_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.task_status_history
    ADD CONSTRAINT task_status_history_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_watchers
    ADD CONSTRAINT task_watchers_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_watchers
    ADD CONSTRAINT task_watchers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_watcher_id_fkey FOREIGN KEY (watcher_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.user_role_assignments
    ADD CONSTRAINT user_role_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.user_role_assignments
    ADD CONSTRAINT user_role_assignments_role_node_id_fkey FOREIGN KEY (role_node_id) REFERENCES public.role_tree(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.user_role_assignments
    ADD CONSTRAINT user_role_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.role_tree(id);


