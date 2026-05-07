import type { AdapterConfigFieldsProps } from "../types";
import {
  DraftInput,
  Field,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";
const selectClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-background outline-none text-sm";
const instructionsFileHint =
  "Absolute path to a markdown file (e.g. AGENTS.md) that defines this agent's behavior. Prepended to the Gemini prompt at runtime.";
const authModeHint =
  "Use Google account mode for Google Workspace, Gemini Code Assist, Google AI Pro, or Ultra seats. This forces Gemini CLI OAuth/Code Assist auth instead of API-key quota.";
const googleCloudProjectHint =
  "Optional Google Cloud project ID required by some Workspace and Code Assist accounts. The project must have Gemini for Cloud API and IAM access configured.";

export function GeminiLocalConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
  hideInstructionsFile,
}: AdapterConfigFieldsProps) {
  return (
    <>
      <Field label="Gemini auth mode" hint={authModeHint}>
        <select
          value={
            isCreate
              ? values!.geminiAuthMode ?? "auto"
              : eff("adapterConfig", "authMode", String(config.authMode ?? "auto"))
          }
          onChange={(event) =>
            isCreate
              ? set!({ geminiAuthMode: event.target.value })
              : mark("adapterConfig", "authMode", event.target.value === "auto" ? undefined : event.target.value)
          }
          className={selectClass}
        >
          <option value="auto">Auto</option>
          <option value="google_account">Google account / Workspace</option>
        </select>
      </Field>

      <Field label="Google Cloud project" hint={googleCloudProjectHint}>
        <DraftInput
          value={
            isCreate
              ? values!.googleCloudProject ?? ""
              : eff("adapterConfig", "googleCloudProject", String(config.googleCloudProject ?? ""))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ googleCloudProject: v })
              : mark("adapterConfig", "googleCloudProject", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="your-project-id"
        />
      </Field>

      {!hideInstructionsFile && (
        <Field label="Agent instructions file" hint={instructionsFileHint}>
          <div className="flex items-center gap-2">
            <DraftInput
              value={
                isCreate
                  ? values!.instructionsFilePath ?? ""
                  : eff(
                      "adapterConfig",
                      "instructionsFilePath",
                      String(config.instructionsFilePath ?? ""),
                    )
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ instructionsFilePath: v })
                  : mark("adapterConfig", "instructionsFilePath", v || undefined)
              }
              immediate
              className={inputClass}
              placeholder="/absolute/path/to/AGENTS.md"
            />
            <ChoosePathButton />
          </div>
        </Field>
      )}
    </>
  );
}
