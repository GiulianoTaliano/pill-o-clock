/**
 * Spoken alarms (F4 TTS): opt-in gating, language mapping, speech content.
 */
import * as Speech from "expo-speech";
import { isTtsEnabled, setTtsEnabled, speakDoseReminder, stopSpeaking, ttsLanguage } from "../src/services/tts";
import { initI18n } from "../src/i18n";

jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "es" }],
}));

beforeAll(() => initI18n());

beforeEach(() => {
  jest.clearAllMocks();
  setTtsEnabled(false);
});

describe("speakDoseReminder", () => {
  it("stays silent while disabled (opt-in)", () => {
    speakDoseReminder("Enalapril", "10 mg");
    expect(jest.mocked(Speech.speak)).not.toHaveBeenCalled();
  });

  it("speaks name + dose in the app language when enabled", () => {
    setTtsEnabled(true);
    speakDoseReminder("Enalapril", "10 mg");
    expect(jest.mocked(Speech.speak)).toHaveBeenCalledTimes(1);
    const [text, opts] = jest.mocked(Speech.speak).mock.calls[0];
    expect(text).toContain("Enalapril");
    expect(text).toContain("10 mg");
    expect(opts).toMatchObject({ language: "es-ES" });
  });

  it("maps app languages to BCP-47 voices", () => {
    expect(ttsLanguage()).toBe("es-ES");
  });

  it("stopSpeaking delegates to the engine", () => {
    stopSpeaking();
    expect(jest.mocked(Speech.stop)).toHaveBeenCalled();
  });
});
