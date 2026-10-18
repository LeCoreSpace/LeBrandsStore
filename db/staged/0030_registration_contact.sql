-- Phase 1 only. Explicitly selected; never changes existing account countries,
-- password records, store GST details, publishing or subscription eligibility.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Registration contact migration requires an administrative BYPASSRLS role';
  END IF;
END;
$$;

ALTER TABLE public.users ADD COLUMN country_code text;
ALTER TABLE public.users ADD CONSTRAINT users_registration_contact CHECK (
  country_code IS NULL OR (
    country_code = ANY(string_to_array('AC,AD,AE,AF,AG,AI,AL,AM,AO,AR,AS,AT,AU,AW,AX,AZ,BA,BB,BD,BE,BF,BG,BH,BI,BJ,BL,BM,BN,BO,BQ,BR,BS,BT,BW,BY,BZ,CA,CC,CD,CF,CG,CH,CI,CK,CL,CM,CN,CO,CR,CU,CV,CW,CX,CY,CZ,DE,DJ,DK,DM,DO,DZ,EC,EE,EG,EH,ER,ES,ET,FI,FJ,FK,FM,FO,FR,GA,GB,GD,GE,GF,GG,GH,GI,GL,GM,GN,GP,GQ,GR,GT,GU,GW,GY,HK,HN,HR,HT,HU,ID,IE,IL,IM,IN,IO,IQ,IR,IS,IT,JE,JM,JO,JP,KE,KG,KH,KI,KM,KN,KP,KR,KW,KY,KZ,LA,LB,LC,LI,LK,LR,LS,LT,LU,LV,LY,MA,MC,MD,ME,MF,MG,MH,MK,ML,MM,MN,MO,MP,MQ,MR,MS,MT,MU,MV,MW,MX,MY,MZ,NA,NC,NE,NF,NG,NI,NL,NO,NP,NR,NU,NZ,OM,PA,PE,PF,PG,PH,PK,PL,PM,PR,PS,PT,PW,PY,QA,RE,RO,RS,RU,RW,SA,SB,SC,SD,SE,SG,SH,SI,SJ,SK,SL,SM,SN,SO,SR,SS,ST,SV,SX,SY,SZ,TA,TC,TD,TG,TH,TJ,TK,TL,TM,TN,TO,TR,TT,TV,TW,TZ,UA,UG,US,UY,UZ,VA,VC,VE,VG,VI,VN,VU,WF,WS,XK,YE,YT,ZA,ZM,ZW', ','))
    AND phone IS NOT NULL AND phone ~ '^\+[1-9][0-9]{1,14}$'
  )
);
COMMENT ON COLUMN public.users.country_code IS
  'Account country selected at registration. NULL for legacy accounts; not verified business country.';
COMMENT ON COLUMN public.users.phone IS
  'New contact-aware registrations use E.164. Phone ownership is not verified; legacy values are preserved.';

-- Keep register_user's identity/grants intact for previously published Workers.
-- This entry point does not UPDATE a duplicate account or expose its existence.
CREATE FUNCTION public.register_user_with_contact(
  p_email text, p_name text, p_hash text, p_algo text, p_iterations integer, p_salt text,
  p_phone text, p_country_code text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_email IS NULL OR p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 120
    OR trim(p_name) ~ '[[:cntrl:]]'
    OR length(p_email) > 254
    OR lower(trim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR p_country_code IS NULL OR p_phone IS NULL
    OR p_phone !~ '^\+[1-9][0-9]{1,14}$'
    OR p_iterations IS DISTINCT FROM 100000
    OR NOT public.valid_password_record(p_hash, p_algo, p_iterations, p_salt) THEN
    RAISE EXCEPTION 'Invalid registration details' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.users (email, name, phone, country_code,
    password_hash, password_algo, password_iterations, password_salt)
  VALUES (lower(trim(p_email)), trim(p_name), p_phone, p_country_code,
    p_hash, p_algo, p_iterations, p_salt)
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.register_user_with_contact(text,text,text,text,integer,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_user_with_contact(text,text,text,text,integer,text,text,text) TO lebrands_app;

-- Supabase may explicitly grant new functions to API roles through default
-- privileges. Revoking PUBLIC alone would not remove those grants.
DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_catalog.pg_roles
    WHERE rolname IN ('anon','authenticated','service_role')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.register_user_with_contact(text,text,text,text,integer,text,text,text) FROM %I', api_role);
  END LOOP;
END;
$$;
