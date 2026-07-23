/**
 * BarcodeScannerModal (F2 — barcode accelerator over the autocomplete).
 *
 * Full-screen camera modal that scans drug-package barcodes (UPC-A, EAN-13,
 * GS1 DataMatrix / Code 128 / QR), resolves them through the bundled NDC
 * database and hands the result back to the caller. Codes that don't carry a
 * resolvable NDC report null — the form falls back to manual entry with the
 * autocomplete, never blocking the user.
 */
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from "react-native";
import { useEffect, useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "../src/i18n";
import { resolveBarcode, type BarcodeMatch } from "../src/services/barcode";

interface Props {
  visible: boolean;
  /** null → the code was readable but didn't resolve to a known drug. */
  onResult: (match: BarcodeMatch | null) => void;
  onClose: () => void;
}

export function BarcodeScannerModal({ visible, onResult, onClose }: Props) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  // Lock so the continuous onBarcodeScanned stream reports exactly once.
  const handled = useRef(false);

  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (visible) {
      handled.current = false;
      if (permission && !permission.granted && permission.canAskAgain) {
        requestPermission().finally(() => setAsked(true));
      } else {
        setAsked(true);
      }
    } else {
      setAsked(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const denied = asked && permission && !permission.granted;

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{
              barcodeTypes: ["upc_a", "ean13", "datamatrix", "code128", "qr"],
            }}
            onBarcodeScanned={({ type, data }) => {
              if (handled.current) return;
              handled.current = true;
              onResult(resolveBarcode(type, data));
            }}
          />
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            {denied ? (
              <>
                <Ionicons name="videocam-off-outline" size={40} color="#94a3b8" />
                <Text className="text-white text-base font-semibold mt-4 text-center">
                  {t("form.scanCameraDenied")}
                </Text>
              </>
            ) : (
              <ActivityIndicator color="#ffffff" />
            )}
          </View>
        )}

        {/* Overlay: instructions + cancel */}
        <View className="absolute top-0 left-0 right-0 pt-16 px-8 items-center">
          <Text className="text-white text-lg font-bold text-center">{t("form.scanTitle")}</Text>
          <Text className="text-white/70 text-sm text-center mt-1">{t("form.scanHint")}</Text>
        </View>
        <View className="absolute bottom-0 left-0 right-0 pb-12 items-center">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
            onPress={onClose}
            className="bg-white/15 rounded-full px-8 py-3"
          >
            <Text className="text-white text-base font-semibold">{t("common.cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
