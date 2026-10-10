/**
 * Allergy manager (F3) — per active profile. Entries picked from the NLM
 * ingredient autocomplete carry an RxCUI and power the conflict check when
 * adding medications; free-text entries are display-only (we never guess
 * from strings). Informational, never blocking.
 */
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import {
  getActiveAllergies,
  insertAllergy,
  deleteAllergy,
  updateAllergy,
} from "../src/db/database";
import {
  searchIngredients,
  isAllergyCheckable,
  type IngredientSuggestion,
} from "../src/services/interactions";
import { generateId, toISOString } from "../src/utils";
import type { Allergy } from "../src/types";
import { useAppStore } from "../src/store";
import { ProfileChip } from "../components/ProfileChip";
import { useToast } from "../src/context/ToastContext";

export default function AllergiesScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const router = useRouter();
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<IngredientSuggestion[]>([]);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Allergy | null>(null);
  const [deleted, setDeleted] = useState<Allergy | null>(null);
  const guard = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setAllergies(await getActiveAllergies());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setDeleted(null);
    setEditing(null);
    setDraft("");
    setSuggestions([]);
    void reload();
  }, [activeProfileId, reload]);

  const add = async (name: string, ingRxcui?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (guard.current) return;
    if (
      allergies.some(
        (a) =>
          a.id !== editing?.id &&
          ((ingRxcui && a.ingRxcui === ingRxcui) ||
            a.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase())
      )
    ) {
      Alert.alert(t("allergies.title"), t("uxHealth.allergyDuplicate"));
      return;
    }
    guard.current = true;
    setBusy(true);
    try {
      Haptics.selectionAsync();
      const allergy = {
        ...(editing ?? {
          id: generateId(),
          createdAt: toISOString(new Date()),
          profileId: activeProfileId,
        }),
        name: trimmed,
        ingRxcui,
      };
      if (editing) await updateAllergy(allergy);
      else await insertAllergy(allergy);
      setDraft("");
      setSuggestions([]);
      setEditing(null);
      await reload();
      showToast(
        t("common.saved", { defaultValue: t("common.save") }),
        "success"
      );
    } catch {
      Alert.alert(t("common.error"), t("uxHealth.saveError"));
    } finally {
      guard.current = false;
      setBusy(false);
    }
  };

  const remove = async (item: Allergy) => {
    try {
      await deleteAllergy(item.id);
      setDeleted(item);
      await reload();
    } catch {
      Alert.alert(t("common.error"), t("uxHealth.deleteError"));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
          className="w-12 h-12 rounded-2xl bg-card border border-border items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color={theme.primary} />
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-text flex-1">
          {t("allergies.title")}
        </Text>
        <ProfileChip />
      </View>
      <Text className="px-5 text-sm text-muted mb-3">
        {t("uxHealth.allergyAddHint")}
      </Text>

      {/* Add row with ingredient autocomplete */}
      <View className="px-5">
        <View className="flex-row items-center gap-2">
          <TextInput
            accessibilityLabel={t("allergies.title")}
            value={draft}
            onChangeText={(v) => {
              setDraft(v);
              setSuggestions(searchIngredients(v));
            }}
            placeholder={t("allergies.placeholder")}
            placeholderTextColor={theme.muted}
            className="flex-1 border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card"
            autoCapitalize="words"
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("allergies.addFreeText")}
            onPress={() => add(draft)}
            disabled={!draft.trim() || busy}
            accessibilityState={{ disabled: !draft.trim() || busy, busy }}
            className={`min-h-[48px] min-w-[48px] items-center justify-center rounded-xl px-4 py-2.5 ${
              draft.trim() && !busy ? "bg-action" : "bg-slate-500"
            }`}
          >
            <Ionicons
              name={editing ? "checkmark" : "add"}
              size={20}
              color="#ffffff"
            />
          </TouchableOpacity>
        </View>
        {suggestions.length > 0 && (
          <View className="mt-1 rounded-xl border border-border bg-card overflow-hidden">
            {suggestions.map((sug) => (
              <TouchableOpacity
                key={sug.key}
                accessibilityRole="button"
                accessibilityLabel={sug.name}
                onPress={() => add(sug.name, sug.rxcui)}
                disabled={busy}
                className="min-h-[48px] px-3 py-3 border-b border-border flex-row items-center gap-2"
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={14}
                  color={theme.primary}
                />
                <Text
                  className="text-sm font-medium text-text flex-1"
                  numberOfLines={1}
                >
                  {sug.name}
                </Text>
              </TouchableOpacity>
            ))}
            <Text className="px-3 py-2 text-xs text-muted">
              {t("uxHealth.allergyAddHint")}
            </Text>
          </View>
        )}
      </View>
      {editing && (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => {
            setEditing(null);
            setDraft("");
            setSuggestions([]);
          }}
          className="mx-5 min-h-[48px] justify-center"
        >
          <Text className="text-primary">{t("common.cancel")}</Text>
        </TouchableOpacity>
      )}
      {deleted && (
        <View
          accessibilityLiveRegion="polite"
          className="mx-5 mt-3 bg-card border border-border rounded-2xl p-3 flex-row items-center"
        >
          <Text className="text-text flex-1">
            {deleted.name} · {t("uxHealth.deleted")}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              try {
                await insertAllergy(deleted);
                setDeleted(null);
                await reload();
              } catch {
                Alert.alert(t("common.error"), t("uxHealth.saveError"));
              } finally {
                setBusy(false);
              }
            }}
            className="min-h-[48px] px-3 justify-center"
          >
            <Text className="text-primary font-semibold">
              {t("uxHealth.undo")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {loading && <ActivityIndicator className="mt-5" color={theme.primary} />}
      {error && (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => void reload()}
          className="mx-5 p-4 min-h-[48px]"
        >
          <Text accessibilityRole="alert" className="text-danger">
            {t("uxHealth.loadError")} · {t("uxHealth.retry")}
          </Text>
        </TouchableOpacity>
      )}

      {/* List */}
      <FlatList
        data={loading || error ? [] : allergies}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: 20, paddingTop: 12 }}
        ListEmptyComponent={
          !loading && !error ? (
            <Text className="text-sm text-muted text-center mt-8">
              {t("allergies.empty")}
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          // Not `item.ingRxcui`: catalogs without an RxCUI (ANMAT) yield fully
          // checkable allergies that carry none.
          const checkable = isAllergyCheckable(item);
          return (
            <View className="flex-row items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3 mb-2">
              <Ionicons
                name={checkable ? "shield-checkmark" : "shield-outline"}
                size={18}
                color={checkable ? theme.primary : theme.muted}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`${t("common.edit")} ${item.name}`}
                onPress={() => {
                  setEditing(item);
                  setDraft(item.name);
                  setSuggestions(searchIngredients(item.name));
                }}
                className="flex-1 min-h-[48px] justify-center"
              >
                <Text className="text-[15px] font-semibold text-text">
                  {item.name}
                </Text>
                <Text className="text-[11px] text-muted mt-0.5">
                  {checkable
                    ? t("allergies.checkable")
                    : t("uxHealth.allergyFree")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t("uxHealth.deleteNamed", {
                  name: item.name,
                })}
                onPress={() =>
                  Alert.alert(
                    t("uxHealth.deleteNamed", { name: item.name }),
                    "",
                    [
                      { text: t("common.cancel"), style: "cancel" },
                      {
                        text: t("common.delete"),
                        style: "destructive",
                        onPress: () => void remove(item),
                      },
                    ]
                  )
                }
                className="min-h-[48px] min-w-[48px] items-center justify-center"
              >
                <Ionicons name="trash-outline" size={18} color={theme.danger} />
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
