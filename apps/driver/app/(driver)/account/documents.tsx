import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router, useFocusEffect } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';

import { Button } from '@kimu/shared/components/Button';
import { ErrorMessage } from '@kimu/shared/components/ErrorMessage';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { getDriverDocuments, submitDriverDocument } from '../../../services/driver-profile-service';
import { DriverDocument } from '../../../types/driver';
import { ApiError } from '../../../services/driver-api-client';
import { useDriverAuthStore } from '../../../stores/useDriverAuthStore';

const DOC_TYPES: { id: DriverDocument['docType']; key: string }[] = [
  { id: 'license', key: 'driverDocLicense' },
  { id: 'national_id', key: 'driverDocNationalId' },
  { id: 'vehicle_registration', key: 'driverDocVehicleRegistration' },
  { id: 'insurance', key: 'driverDocInsurance' },
  { id: 'profile_photo', key: 'driverDocProfilePhoto' },
  { id: 'vehicle_photo', key: 'driverDocVehiclePhoto' },
];

const STATUS_COLORS: Record<DriverDocument['status'], string> = {
  pending: '#D97706',
  approved: '#0E7C4A',
  rejected: '#DC2626',
  expired: '#DC2626',
};

const STATUS_KEYS: Record<DriverDocument['status'], string> = {
  pending: 'documentStatusPending',
  approved: 'documentStatusApproved',
  rejected: 'documentStatusRejected',
  expired: 'documentStatusExpired',
};

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const DOCUMENT_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export default function DriverDocumentsScreen() {
  const { t } = useTranslation();
  const currentDriver = useDriverAuthStore((s) => s.currentDriver);
  const refreshDriver = useDriverAuthStore((s) => s.refresh);
  const wasPendingApproval = useRef(false);
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState<DriverDocument['docType'] | null>(null);
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    setError(undefined);
    getDriverDocuments()
      .then(setDocuments)
      .catch(() => setError(t('requestFailed')))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  useEffect(() => {
    if (!currentDriver) return;
    if (!currentDriver.verified) {
      wasPendingApproval.current = true;
    } else if (wasPendingApproval.current) {
      router.replace('/(driver)/(tabs)');
    }
  }, [currentDriver]);

  useFocusEffect(
    useCallback(() => {
      if (!currentDriver || currentDriver.verified) return undefined;
      let cancelled = false;
      const checkApproval = () => {
        if (!cancelled) refreshDriver().catch(() => {});
      };
      checkApproval();
      const timer = setInterval(checkApproval, 15000);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [currentDriver?.verified, refreshDriver])
  );

  async function chooseFile() {
    if (!docType) return setError(t('driverChooseDocType'));
    setError(undefined);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['profile_photo', 'vehicle_photo'].includes(docType)
          ? DOCUMENT_FILE_TYPES.filter((type) => type.startsWith('image/'))
          : DOCUMENT_FILE_TYPES,
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (!result.canceled) {
        const file = result.assets[0];
        if (file.size != null && file.size > MAX_FILE_SIZE_BYTES) {
          setError(t('driverFileTooLarge'));
          return;
        }
        setSelectedFile(file);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('driverDocumentSubmitFailed'));
    }
  }

  async function handleSubmit() {
    if (!docType) return setError(t('driverChooseDocType'));
    if (!selectedFile) return setError(t('driverChooseFile'));
    setError(undefined);
    setSubmitting(true);
    try {
      // On the web the picker hands over the File itself; on a phone it gives
      // a file:// URI that React Native streams as a multipart part. Either
      // way the server receives the real file and checks its type and size.
      let file: Blob | { uri: string; name: string; type: string };
      let contentType = selectedFile.mimeType || '';
      if (Platform.OS === 'web') {
        const webFile = selectedFile.file ?? (await (await fetch(selectedFile.uri)).blob());
        if (webFile.size > MAX_FILE_SIZE_BYTES) {
          setError(t('driverFileTooLarge'));
          return;
        }
        contentType = contentType || webFile.type;
        if (!contentType) throw new Error('This file type is not supported. Choose a PDF or image file.');
        file = webFile.type === contentType ? webFile : new Blob([await webFile.arrayBuffer()], { type: contentType });
      } else {
        if (!contentType) throw new Error('This file type is not supported. Choose a PDF or image file.');
        file = { uri: selectedFile.uri, name: selectedFile.name, type: contentType };
      }
      await submitDriverDocument({ docType, file, fileName: selectedFile.name });
      setSelectedFile(null);
      setDocType(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('driverDocumentSubmitFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenShell title={t('documents')} back background="bg-white" backLabel={t('back')}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="px-6 pt-2 pb-10">
        <Text className="font-sans mt-1 text-sm text-text-secondary">{t('driverDocumentsIntro')}</Text>
        {currentDriver && !currentDriver.verified ? (
          <View className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3">
            <Text className="text-sm font-semibold text-ink">{t('driverAwaitingVerification')}</Text>
            <Text className="font-sans mt-1 text-[14px] leading-[21px] text-text-secondary">
              {t('driverApprovalNeededBlurb')}
            </Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator className="mt-6" color="#0E7C4A" />
        ) : error ? (
          <View className="mt-6 gap-3">
            <ErrorMessage message={error} />
            <Button title={t('tryAgain')} variant="outline" onPress={load} />
          </View>
        ) : documents.length === 0 ? (
          <Text className="font-sans mt-6 text-sm text-text-secondary">{t('driverNoDocumentsYet')}</Text>
        ) : (
          <View className="mt-5 gap-2.5">
            {documents.map((doc) => (
              <View key={doc.id} className="flex-row items-center justify-between rounded-xl border border-border p-3.5">
                <View>
                  <Text className="text-[14px] font-semibold text-ink">
                    {t((DOC_TYPES.find((d) => d.id === doc.docType)?.key ?? 'driverDocOther') as any)}
                  </Text>
                  {doc.fileName ? <Text className="font-sans mt-0.5 text-[13px] text-text-secondary">{doc.fileName}</Text> : null}
                </View>
                <Text className="text-[13px] font-semibold" style={{ color: STATUS_COLORS[doc.status] }}>{t(STATUS_KEYS[doc.status] as any)}</Text>
              </View>
            ))}
          </View>
        )}

        <Text className="mt-7 text-base font-bold text-ink">{t('driverAddDocument')}</Text>
        <View className="mt-3 flex-row flex-wrap gap-2">
          {DOC_TYPES.map((docTypeOption) => (
            <Pressable
              key={docTypeOption.id}
              className={`rounded-full border px-3 py-1.5 ${docType === docTypeOption.id ? 'border-primary bg-primary/10' : 'border-border'}`}
              onPress={() => { setDocType(docTypeOption.id); setSelectedFile(null); setError(undefined); }}
            >
              <Text className={docType === docTypeOption.id ? 'text-[13px] font-semibold text-primary' : 'text-[13px] text-ink'}>
                {t(docTypeOption.key as any)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="mt-4 gap-3">
          <Button
            title={selectedFile ? selectedFile.name : t('driverChooseFile')}
            variant="outline"
            onPress={chooseFile}
            disabled={!docType || submitting}
          />
          {selectedFile ? (
            <Text className="font-sans text-[13.5px] leading-5 text-text-secondary">
              {selectedFile.name}{selectedFile.size != null ? ` · ${(selectedFile.size / 1024 / 1024).toFixed(1)} MB` : ''}
            </Text>
          ) : null}
          <Text className="font-sans text-[13.5px] leading-5 text-text-secondary">{t('driverUploadFileHint')}</Text>
          {error ? <ErrorMessage message={error} /> : null}
        </View>

        <View className="mt-4">
          <Button
            title={t('driverUploadFile')}
            onPress={handleSubmit}
            loading={submitting}
            disabled={!selectedFile || !docType}
          />
        </View>
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}
