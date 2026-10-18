-- Explicit, one-time allowance for the two approved legacy accounts only.
-- New registrations still require their normal country and E.164 phone.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Legacy country update requires an administrative BYPASSRLS role';
  END IF;
END $$;

LOCK TABLE public.users IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.users)<>2
    OR EXISTS(SELECT 1 FROM public.users WHERE country_code IS NOT NULL OR phone IS NOT NULL) THEN
    RAISE EXCEPTION 'Expected exactly two legacy accounts with unset country and phone. No accounts were changed.';
  END IF;
END $$;

ALTER TABLE public.users ADD COLUMN legacy_country_only boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.users.legacy_country_only IS
  'Administrative legacy exception only; automatically ends after a valid phone is supplied. Never enabled by registration.';

CREATE FUNCTION public.guard_legacy_user_country() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.legacy_country_only AND (TG_OP='INSERT' OR NOT OLD.legacy_country_only) THEN
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles
      WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
      RAISE EXCEPTION 'Legacy contact exceptions require an administrator' USING ERRCODE='42501';
    END IF;
  END IF;
  IF NEW.phone IS NOT NULL AND NEW.phone ~ '^\+[1-9][0-9]{1,14}$' THEN
    NEW.legacy_country_only:=false;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_legacy_user_country() FROM PUBLIC,anon,authenticated,lebrands_app;
CREATE TRIGGER users_legacy_country_guard
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_user_country();

ALTER TABLE public.users DROP CONSTRAINT users_registration_contact;
ALTER TABLE public.users ADD CONSTRAINT users_registration_contact CHECK (
  country_code IS NULL OR (
    country_code=ANY(string_to_array('AC,AD,AE,AF,AG,AI,AL,AM,AO,AR,AS,AT,AU,AW,AX,AZ,BA,BB,BD,BE,BF,BG,BH,BI,BJ,BL,BM,BN,BO,BQ,BR,BS,BT,BW,BY,BZ,CA,CC,CD,CF,CG,CH,CI,CK,CL,CM,CN,CO,CR,CU,CV,CW,CX,CY,CZ,DE,DJ,DK,DM,DO,DZ,EC,EE,EG,EH,ER,ES,ET,FI,FJ,FK,FM,FO,FR,GA,GB,GD,GE,GF,GG,GH,GI,GL,GM,GN,GP,GQ,GR,GT,GU,GW,GY,HK,HN,HR,HT,HU,ID,IE,IL,IM,IN,IO,IQ,IR,IS,IT,JE,JM,JO,JP,KE,KG,KH,KI,KM,KN,KP,KR,KW,KY,KZ,LA,LB,LC,LI,LK,LR,LS,LT,LU,LV,LY,MA,MC,MD,ME,MF,MG,MH,MK,ML,MM,MN,MO,MP,MQ,MR,MS,MT,MU,MV,MW,MX,MY,MZ,NA,NC,NE,NF,NG,NI,NL,NO,NP,NR,NU,NZ,OM,PA,PE,PF,PG,PH,PK,PL,PM,PR,PS,PT,PW,PY,QA,RE,RO,RS,RU,RW,SA,SB,SC,SD,SE,SG,SH,SI,SJ,SK,SL,SM,SN,SO,SR,SS,ST,SV,SX,SY,SZ,TA,TC,TD,TG,TH,TJ,TK,TL,TM,TN,TO,TR,TT,TV,TW,TZ,UA,UG,US,UY,UZ,VA,VC,VE,VG,VI,VN,VU,WF,WS,XK,YE,YT,ZA,ZM,ZW',','))
    AND ((phone IS NOT NULL AND phone ~ '^\+[1-9][0-9]{1,14}$')
      OR (legacy_country_only AND phone IS NULL))
  )
);
UPDATE public.users SET legacy_country_only=true,country_code='IN';
