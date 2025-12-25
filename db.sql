--
-- PostgreSQL database dump
--

-- Dumped from database version 17.7 (bdc8956)
-- Dumped by pg_dump version 17.2

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Attendance; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public."Attendance" (
    attendance_id integer NOT NULL,
    user_id integer NOT NULL,
    location_id integer NOT NULL,
    type character varying(50),
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    user_latitude double precision,
    user_longitude double precision,
    status character varying(50),
    notes text
);


ALTER TABLE public."Attendance" OWNER TO neondb_owner;

--
-- Name: Attendance_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public."Attendance_attendance_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Attendance_attendance_id_seq" OWNER TO neondb_owner;

--
-- Name: Attendance_attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public."Attendance_attendance_id_seq" OWNED BY public."Attendance".attendance_id;


--
-- Name: Locations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public."Locations" (
    location_id integer NOT NULL,
    location_name character varying(150) NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    radius double precision,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public."Locations" OWNER TO neondb_owner;

--
-- Name: Locations_location_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public."Locations_location_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Locations_location_id_seq" OWNER TO neondb_owner;

--
-- Name: Locations_location_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public."Locations_location_id_seq" OWNED BY public."Locations".location_id;


--
-- Name: User; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public."User" (
    user_id integer NOT NULL,
    name character varying(100) NOT NULL,
    username_email character varying(150) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(50),
    nim_nip character varying(50)
);


ALTER TABLE public."User" OWNER TO neondb_owner;

--
-- Name: User_user_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public."User_user_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."User_user_id_seq" OWNER TO neondb_owner;

--
-- Name: User_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public."User_user_id_seq" OWNED BY public."User".user_id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.notifications (
    notification_id integer,
    title text NOT NULL,
    message text NOT NULL,
    created_at timestamp without time zone NOT NULL
);


ALTER TABLE public.notifications OWNER TO neondb_owner;

--
-- Name: user_2fa_codes; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_2fa_codes (
    user_id integer,
    code text NOT NULL,
    expires_at timestamp without time zone NOT NULL
);


ALTER TABLE public.user_2fa_codes OWNER TO neondb_owner;

--
-- Name: Attendance attendance_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."Attendance" ALTER COLUMN attendance_id SET DEFAULT nextval('public."Attendance_attendance_id_seq"'::regclass);


--
-- Name: Locations location_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."Locations" ALTER COLUMN location_id SET DEFAULT nextval('public."Locations_location_id_seq"'::regclass);


--
-- Name: User user_id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."User" ALTER COLUMN user_id SET DEFAULT nextval('public."User_user_id_seq"'::regclass);


--
-- Data for Name: Attendance; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public."Attendance" (attendance_id, user_id, location_id, type, "timestamp", user_latitude, user_longitude, status, notes) FROM stdin;
\.


--
-- Data for Name: Locations; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public."Locations" (location_id, location_name, latitude, longitude, radius, created_at) FROM stdin;
1	Telkom University Bandung	-6.97321	107.63014	50	2025-12-25 01:57:25.948011
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public."User" (user_id, name, username_email, password_hash, role, nim_nip) FROM stdin;
1	Alice Johnson	alice@example.com	hashed_password_1	student	NIM12345
2	Bob Smith	bob@example.com	hashed_password_2	student	NIM12346
3	Carol Lee	carol@example.com	hashed_password_3	teacher	NIP98765
4	David Kim	david@example.com	hashed_password_4	student	NIM12347
5	Eva Martinez	eva@example.com	hashed_password_5	teacher	NIP98766
6	Radhofan	radhofun@gmail.com	password	student	1301223058
7	Pronen	amliste28@gmail.com	amliste28	developer	NIP232323
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.notifications (notification_id, title, message, created_at) FROM stdin;
1	Welcome	Thanks for signing up! We hope you enjoy our service.	2025-12-23 09:00:00
2	Maintenance	Scheduled maintenance will occur tonight at 11 PM.	2025-12-23 12:00:00
3	Update	New features have been added to your dashboard.	2025-12-23 15:30:00
4	Reminder	Don’t forget to complete your profile to get personalized recommendations.	2025-12-23 16:45:00
5	Alert	Unusual login attempt detected on your account.	2025-12-23 18:20:00
\.


--
-- Data for Name: user_2fa_codes; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.user_2fa_codes (user_id, code, expires_at) FROM stdin;
\N	8yjjs9	2025-12-19 08:26:26.933958
\N	kp2iwi	2025-12-19 08:28:37.599793
\N	7nshla	2025-12-19 08:31:28.192955
\N	hafrtg	2025-12-19 08:36:42.588127
\N	s1nlxg	2025-12-19 08:36:46.037027
\N	m3ohx6	2025-12-19 08:37:22.507206
\N	p0cjac	2025-12-19 08:37:45.394148
2	4ywipk	2025-12-22 12:39:46.456344
\.


--
-- Name: Attendance_attendance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public."Attendance_attendance_id_seq"', 1, false);


--
-- Name: Locations_location_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public."Locations_location_id_seq"', 1, false);


--
-- Name: User_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public."User_user_id_seq"', 7, true);


--
-- Name: Attendance Attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."Attendance"
    ADD CONSTRAINT "Attendance_pkey" PRIMARY KEY (attendance_id);


--
-- Name: Locations Locations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."Locations"
    ADD CONSTRAINT "Locations_pkey" PRIMARY KEY (location_id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (user_id);


--
-- Name: User User_username_email_key; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_username_email_key" UNIQUE (username_email);


--
-- Name: Attendance Attendance_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."Attendance"
    ADD CONSTRAINT "Attendance_location_id_fkey" FOREIGN KEY (location_id) REFERENCES public."Locations"(location_id) ON DELETE CASCADE;


--
-- Name: Attendance Attendance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public."Attendance"
    ADD CONSTRAINT "Attendance_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."User"(user_id) ON DELETE CASCADE;


--
-- Name: user_2fa_codes user_2fa_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_2fa_codes
    ADD CONSTRAINT user_2fa_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."User"(user_id);


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

