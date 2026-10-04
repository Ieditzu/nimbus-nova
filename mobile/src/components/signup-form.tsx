import { useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { NovaError } from "../api/client";
import type { IdentityKind } from "../api/types";
import { useAuth } from "../auth/session";
import {
  importCardPhoto,
  importReaderPdf,
  releaseAsset,
  type IdentityAsset,
} from "../identity/files";
import {
  documentSlots,
  identityApproved,
  slotLabels,
  type CaptureSlot,
  type IdentityResult,
} from "../identity/policy";
import { submitIdentity } from "../identity/submit";
import { IdentityError } from "../identity/errors";
import { errorMessage } from "../lib/errors";
import { AuthField, PasswordField } from "./auth-fields";
import { SelfieVideo } from "./selfie-video";
import { CameraCapture } from "./camera-capture";
import { fonts, useTheme, type Colors } from "./theme";
import { Button, Icon, usePageScroll } from "./ui";

export function SignupForm({
  initialEmail,
  onLogin,
}: {
  initialEmail: string;
  onLogin: (email: string, confirmation?: string) => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const { signIn } = useAuth();
  const scrollToTop = usePageScroll();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [guardian, setGuardian] = useState("");
  const [guardianVisible, setGuardianVisible] = useState(false);
  const [kind, setKind] = useState<IdentityKind>("ci");
  const [assets, setAssets] = useState<
    Partial<Record<CaptureSlot, IdentityAsset>>
  >({});
  const [cameraSlot, setCameraSlot] = useState<CaptureSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const alive = useRef(true);
  const assetsRef = useRef(assets);
  const proofRef = useRef<IdentityResult | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    scrollToTop();
  }, [step, scrollToTop]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      Object.values(assetsRef.current).forEach(releaseAsset);
      assetsRef.current = {};
      proofRef.current = null;
    };
  }, []);
  function updateAsset(slot: CaptureSlot, asset?: IdentityAsset) {
    releaseAsset(assetsRef.current[slot]);
    const next = { ...assetsRef.current };
    if (asset) next[slot] = asset;
    else delete next[slot];
    assetsRef.current = next;
    proofRef.current = null;
    setAssets(next);
    setError("");
  }
  function chooseKind(value: IdentityKind) {
    if (kind === value || busy) return;
    Object.values(assetsRef.current).forEach(releaseAsset);
    assetsRef.current = {};
    setAssets({});
    proofRef.current = null;
    setKind(value);
    setError("");
  }
  async function pick(slot: CaptureSlot) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const asset =
        slot === "cei_pdf" ? await importReaderPdf() : await importCardPhoto();
      if (asset) {
        if (alive.current) updateAsset(slot, asset);
        else releaseAsset(asset);
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof IdentityError
            ? e.message
            : "Nu am putut importa fișierul. Selectează-l din nou.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function finish() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    let created = false;
    try {
      let result = proofRef.current;
      if (!result || !identityApproved(result, email)) {
        proofRef.current = null;
        result = await submitIdentity({
          email,
          kind,
          assets: assetsRef.current,
          cancelled: () => !alive.current,
          progress: (value) => {
            if (alive.current) setProgress(value);
          },
        });
        proofRef.current = result;
      }
      if (!alive.current) return;
      if (!identityApproved(result, email) || !result.proof)
        throw new IdentityError("Verificarea a expirat. Încearcă din nou.");
      setProgress("Se creează contul...");
      await api.register({
        role: "worker",
        email: email.toLowerCase().trim(),
        password,
        display_name: name.trim(),
        phone_number: phone.trim(),
        identity_proof: result.proof.token,
        ...(guardian.trim() ? { guardian_email: guardian.trim() } : {}),
      });
      created = true;
      proofRef.current = null;
      if (!alive.current) return;
      await signIn(email, password);
      if (alive.current) setPassword("");
    } catch (e) {
      if (!alive.current) return;
      if (created) {
        setPassword("");
        onLogin(email, "Contul a fost creat. Conectează-te pentru a continua.");
      } else {
        setError(e instanceof IdentityError ? e.message : errorMessage(e));
        if (
          e instanceof NovaError &&
          ["proof_expired", "proof_used", "identity_required"].includes(e.code)
        )
          proofRef.current = null;
        if (e instanceof NovaError && e.message.includes("tutorelui")) {
          setGuardianVisible(true);
          setStep(0);
        }
      }
    } finally {
      submitting.current = false;
      if (alive.current) {
        setBusy(false);
        setProgress("");
      }
    }
  }
  const basicsReady =
    name.trim().length >= 2 &&
    name.trim().length <= 80 &&
    email.trim().includes("@") &&
    password.length >= 8 &&
    phone.trim().length >= 8 &&
    (!guardian.trim() || guardian.includes("@"));
  const documentsReady = documentSlots[kind].every((slot) => assets[slot]);
  const headings = [
    "Creează un cont",
    "Actul de identitate",
    "Confirmă că ești tu",
  ];
  return (
    <View style={s.form}>
      <View style={s.intro}>
        <Text style={s.title}>{headings[step]}</Text>
        <Text style={s.body}>
          {step === 0
            ? "Completează datele contului, apoi verifică-ți identitatea."
            : step === 1
              ? "Alege actul românesc pe care îl ai. Fotografiile trebuie să fie clare, fără reflexii."
              : "Filmează un selfie scurt urmând indicațiile pentru mișcarea capului."}
        </Text>
      </View>
      <View accessibilityLabel={`Pasul ${step + 1} din 3`} style={s.steps}>
        {["Cont", "Act", "Selfie"].map((label, index) => (
          <View key={label} style={s.step}>
            <View style={[s.stepLine, index <= step && s.activeLine]} />
            <Text
              style={[s.stepLabel, index === step && { color: colors.text }]}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
      {step === 0 ? (
        <>
          <AuthField
            label="Nume complet"
            editable={!busy}
            autoComplete="name"
            value={name}
            onChangeText={setName}
            maxLength={80}
            placeholder="Numele tău"
          />
          <AuthField
            label="Email"
            editable={!busy}
            autoComplete="email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={(value) => {
              proofRef.current = null;
              setEmail(value);
            }}
            placeholder="nume@exemplu.ro"
          />
          <AuthField
            label="Număr de telefon"
            value={phone}
            onChangeText={setPhone}
            editable={!busy}
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholder="+40 712 345 678"
            maxLength={30}
          />
          <PasswordField
            newPassword
            editable={!busy}
            value={password}
            onChangeText={setPassword}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: guardianVisible }}
            disabled={busy}
            onPress={() => setGuardianVisible(!guardianVisible)}
            style={s.guardianToggle}
          >
            <Text style={s.link}>Ai sub 18 ani?</Text>
            <Icon
              name={
                guardianVisible ? "chevron-up-outline" : "chevron-down-outline"
              }
              size={18}
              color={colors.accent}
            />
          </Pressable>
          {guardianVisible ? (
            <>
              <AuthField
                label="Emailul tutorelui"
                editable={!busy}
                value={guardian}
                onChangeText={setGuardian}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Emailul părintelui sau tutorelui"
              />
              <Text style={s.help}>
                Sub 18 ani, contul este pentru voluntariat. Vârsta se stabilește
                din actul de identitate.
              </Text>
            </>
          ) : null}
        </>
      ) : step === 1 ? (
        <>
          <View style={s.choices}>
            {(["ci", "cei"] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityLabel={
                  value === "ci"
                    ? "CI, carte de identitate clasică"
                    : "CEI, carte electronică de identitate"
                }
                accessibilityState={{ checked: kind === value, disabled: busy }}
                aria-checked={kind === value}
                disabled={busy}
                onPress={() => chooseKind(value)}
                style={[s.choice, kind === value && s.choiceActive]}
              >
                <Icon
                  name={
                    value === "ci" ? "card-outline" : "hardware-chip-outline"
                  }
                  color={kind === value ? colors.accent : colors.muted}
                  size={24}
                />
                <Text style={s.choiceTitle}>{value.toUpperCase()}</Text>
                <Text style={s.help}>
                  {value === "ci"
                    ? "Carte de identitate clasică"
                    : "Carte electronică de identitate"}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.help}>
            {kind === "ci"
              ? "Importă sau fotografiază ambele fețe ale CI. Nu este nevoie de PDF."
              : "Fotografiază sau importă întregul CEI, față și verso, inclusiv portretul de pe card. Nu decupa doar portretul. Apoi importă PDF-ul exportat din RO CEI Reader."}
          </Text>
          {documentSlots[kind].map((slot) => (
            <AssetCard
              key={slot}
              slot={slot}
              asset={assets[slot]}
              busy={busy}
              action={slot === "cei_pdf" ? "Importă PDF-ul" : "Importă fotografia"}
              onChoose={() => void pick(slot)}
              onCapture={
                slot === "cei_pdf"
                  ? undefined
                  : () => {
                      setError("");
                      setCameraSlot(slot);
                    }
              }
              onRemove={() => updateAsset(slot)}
            />
          ))}
        </>
      ) : (
        <>
          <AssetCard
            slot="selfie"
            asset={assets.selfie}
            busy={busy}
            action="Filmează selfie-ul"
            onChoose={() => {
              setError("");
              setCameraSlot("selfie");
            }}
            onRemove={() => updateAsset("selfie")}
          />
          <Text style={s.help}>
            Privește camera, apoi întoarce ușor capul la stânga și la dreapta.
            Filmarea durează 8 secunde și nu înregistrează sunet.
          </Text>
          <View style={s.privacy}>
            <Icon name="lock-closed-outline" size={18} />
            <Text style={[s.help, s.grow]}>
              Fotografiile actului și filmarea selfie sunt trimise către ID Analyzer
              în regiunea UE pentru verificare. Copiile temporare de pe telefon
              se șterg când închizi înscrierea.
            </Text>
          </View>
        </>
      )}
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      {busy && progress ? (
        <Text accessibilityLiveRegion="polite" style={s.body}>
          {progress}
        </Text>
      ) : null}
      <Button
        disabled={
          busy ||
          (step === 0
            ? !basicsReady
            : step === 1
              ? !documentsReady
              : !assets.selfie || !documentsReady)
        }
        onPress={() => {
          setError("");
          if (step === 0) setStep(1);
          else if (step === 1) setStep(2);
          else void finish();
        }}
      >
        {busy
          ? progress || "Se pregătește fișierul..."
          : step === 2
            ? "Verifică și creează contul"
            : "Continuă"}
      </Button>
      {step > 0 ? (
        <Button
          variant="outline"
          disabled={busy}
          onPress={() => {
            setError("");
            setStep(step === 2 ? 1 : 0);
          }}
        >
          Înapoi
        </Button>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => onLogin(email)}
        style={s.login}
      >
        <Text style={s.link}>Ai deja cont? Conectează-te</Text>
      </Pressable>
      {cameraSlot === "selfie" ? (
        <SelfieVideo onCapture={(asset) => { updateAsset("selfie", asset); setCameraSlot(null); }} onClose={() => setCameraSlot(null)} />
      ) : cameraSlot ? (
        <CameraCapture
          key={cameraSlot}
          title={slotLabels[cameraSlot]}
          selfie={false}
          onCapture={(asset) => {
            updateAsset(cameraSlot, asset);
            setCameraSlot(null);
          }}
          onClose={() => setCameraSlot(null)}
        />
      ) : null}
    </View>
  );
}
function AssetCard({
  slot,
  asset,
  busy,
  action,
  onChoose,
  onCapture,
  onRemove,
}: {
  slot: CaptureSlot;
  asset?: IdentityAsset;
  busy: boolean;
  action: string;
  onChoose: () => void;
  onCapture?: () => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const pdf = slot === "cei_pdf";
  const video = asset?.contentType.startsWith("video/");
  return (
    <View style={s.asset}>
      <View style={s.assetHeader}>
        <Icon name={pdf ? "document-text-outline" : "image-outline"} />
        <Text style={[s.label, s.grow]}>{slotLabels[slot]}</Text>
        {asset ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Elimină ${slotLabels[slot]}`}
            disabled={busy}
            onPress={onRemove}
            style={s.remove}
          >
            <Icon name="close-outline" size={22} />
          </Pressable>
        ) : null}
      </View>
      {asset && !pdf && !video ? (
        <Image
          accessibilityLabel={`Previzualizare ${slotLabels[slot]}`}
          source={{ uri: asset.uri }}
          resizeMode="contain"
          style={[s.photo, slot === "selfie" && s.selfie]}
        />
      ) : null}
      {asset ? (
        <Text numberOfLines={2} style={s.help}>
          {video ? "Filmarea selfie este pregătită · " : pdf ? `${asset.name} · ` : ""}
          {(asset.size / 1_000_000).toFixed(1)} MB
        </Text>
      ) : (
        <Text style={s.help}>
          {pdf
            ? "Fișier PDF original · maximum 2 MB"
            : slot === "selfie"
              ? "Filmează-te cu camera frontală și urmează indicațiile pentru mișcarea capului."
              : "Actul întreg, cu toate colțurile vizibile."}
        </Text>
      )}
      <Button
        variant="outline"
        disabled={busy}
        icon={
          pdf
            ? "attach-outline"
            : action === "Importă fotografia"
              ? "images-outline"
              : "camera-outline"
        }
        onPress={onChoose}
      >
        {asset
          ? pdf
            ? "Înlocuiește PDF-ul"
            : action === "Importă fotografia"
              ? "Înlocuiește fotografia"
              : slot === "selfie" ? "Refă filmarea" : "Refă fotografia"
          : action}
      </Button>
      {onCapture ? (
        <Button
          variant="outline"
          disabled={busy}
          icon="camera-outline"
          onPress={onCapture}
        >
          {asset ? "Refă cu camera" : "Fotografiază cu camera"}
        </Button>
      ) : null}
    </View>
  );
}
const styles = (c: Colors) =>
  StyleSheet.create({
    form: {
      gap: 18,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 28,
      backgroundColor: c.surface,
      padding: 20,
    },
    intro: { gap: 8 },
    title: { fontFamily: fonts.display, fontSize: 26, color: c.text },
    body: {
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 21,
      color: c.muted,
    },
    help: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 20,
      color: c.muted,
    },
    label: { fontFamily: fonts.bold, fontSize: 15, color: c.text },
    grow: { flex: 1, minWidth: 0 },
    steps: { flexDirection: "row", gap: 12 },
    step: { flex: 1, gap: 8 },
    stepLine: { height: 3, borderRadius: 2, backgroundColor: c.raised },
    activeLine: { backgroundColor: c.accent },
    stepLabel: { fontFamily: fonts.body, color: c.muted, fontSize: 12 },
    choices: { flexDirection: "row", gap: 12 },
    choice: {
      flex: 1,
      minWidth: 0,
      gap: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 24,
      padding: 16,
    },
    choiceActive: { borderColor: c.accent, backgroundColor: c.accentSoft },
    choiceTitle: { fontFamily: fonts.bold, color: c.text, fontSize: 18 },
    asset: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 24,
      padding: 16,
      gap: 12,
      backgroundColor: c.surface,
    },
    assetHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    remove: {
      minWidth: 48,
      minHeight: 48,
      justifyContent: "center",
      alignItems: "center",
    },
    photo: {
      width: "100%",
      height: 170,
      borderRadius: 24,
      backgroundColor: c.background,
    },
    selfie: { height: 260 },
    privacy: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
    error: {
      fontFamily: fonts.body,
      color: c.danger,
      backgroundColor: c.dangerSoft,
      padding: 14,
      borderRadius: 24,
      fontSize: 14,
      lineHeight: 21,
      overflow: "hidden",
    },
    link: {
      fontFamily: fonts.bold,
      color: c.accent,
      fontSize: 14,
      textAlign: "center",
    },
    login: { minHeight: 48, justifyContent: "center", alignItems: "center" },
    guardianToggle: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
  });
