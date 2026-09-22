import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { ErrorMessage } from '../../../components/ErrorMessage';
import { BackHeader } from '../../../components/BackHeader';
import { useTranslation } from '../../../hooks/useTranslation';
import { getDriverDocuments, submitDriverDocument } from '../../../services/driver-profile-service';
import { DriverDocument } from '../../../types/driver';
import { ApiError } from '../../../services/driver-api-client';

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
  approved: '#16A34A',
  rejected: '#DC2626',
  expired: '#DC2626',
};

const STATUS_KEYS: Record<DriverDocument['status'], string> = {
  pending: 'documentStatusPending',
  approved: 'documentStatusApproved',
  rejected: 'documentStatusRejected',
  expired: 'documentStatusExpired',
};

// Document submission is a metadata form here, not a real camera/file
// upload — the backend itself has no file-storage endpoint either
// (driverProfile.routes.js's POST /documents only ever persists whatever
// fileUrl/fileName string it's given).
export default function DriverDocumentsScreen() {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState<DriverDocument['docType'] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    getDriverDocuments()
      .then(setDocuments)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleSubmit() {
    if (!docType) return setError(t('driverChooseDocType'));
    if (!fileName.trim()) return setError(t('driverEnterFileReference'));
    setError(undefined);
    setSubmitting(true);
    try {
      await submitDriverDocument({ docType, fileName: fileName.trim() });
      setDocType(null);
      setFileName('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('driverDocumentSubmitFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-6 pt-2 pb-10" keyboardShouldPersistTaps="handled">
        <BackHeader />
        <Text className="mt-2 text-xl font-bold text-ink">{t('documents')}</Text>
        <Text className="mt-1 text-sm text-text-secondary">{t('driverDocumentsIntro')}</Text>

        {loading ? (
          <ActivityIndicator className="mt-6" color="#16A34A" />
        ) : documents.length === 0 ? (
          <Text className="mt-6 text-sm text-text-secondary">{t('driverNoDocumentsYet')}</Text>
        ) : (
          <View className="mt-5 gap-2.5">
            {documents.map((doc) => (
              <View key={doc.id} className="flex-row items-center justify-between rounded-xl border border-border p-3.5">
                <View>
                  <Text className="text-[14px] font-semibold text-ink">
                    {t((DOC_TYPES.find((d) => d.id === doc.docType)?.key ?? 'driverDocOther') as any)}
                  </Text>
                  {doc.fileName ? <Text className="mt-0.5 text-xs text-text-secondary">{doc.fileName}</Text> : null}
                </View>
                <Text className="text-xs font-semibold" style={{ color: STATUS_COLORS[doc.status] }}>{t(STATUS_KEYS[doc.status] as any)}</Text>
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
              onPress={() => setDocType(docTypeOption.id)}
            >
              <Text className={docType === docTypeOption.id ? 'text-[13px] font-semibold text-primary' : 'text-[13px] text-ink'}>
                {t(docTypeOption.key as any)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="mt-4 gap-3">
          <Input label={t('driverFileReference')} placeholder={t('driverFileReferencePlaceholder')} value={fileName} onChangeText={setFileName} prefixIcon="document-attach-outline" />
          {error ? <ErrorMessage message={error} /> : null}
        </View>

        <View className="mt-4 flex-row items-center rounded-xl bg-gray-light p-3">
          <Ionicons name="camera-outline" size={18} color="#6B7280" />
          <Text className="ml-2 flex-1 text-xs text-text-secondary">{t('driverCameraComingSoon')}</Text>
        </View>

        <View className="mt-4">
          <Button title={t('driverSubmitDocument')} onPress={handleSubmit} loading={submitting} />
        </View>
      </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}
