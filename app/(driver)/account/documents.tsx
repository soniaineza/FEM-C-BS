import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { KeyboardFormScrollView } from '../../../components/layout/KeyboardFormScrollView';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { ErrorMessage } from '../../../components/ErrorMessage';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { Chip } from '../../../components/ui/Chip';
import { useTranslation } from '../../../hooks/useTranslation';
import { useResponsive } from '../../../hooks/useResponsive';
import { getDriverDocuments, submitDriverDocument } from '../../../services/driver-profile-service';
import { DriverDocument } from '../../../types/driver';
import { ApiError } from '../../../services/driver-api-client';
import { Colors } from '../../../constants/theme';
import { EmptyState, LoadingState } from '../../../components/ui';

const DOC_TYPES: { id: DriverDocument['docType']; key: string }[] = [
  { id: 'license', key: 'driverDocLicense' },
  { id: 'national_id', key: 'driverDocNationalId' },
  { id: 'vehicle_registration', key: 'driverDocVehicleRegistration' },
  { id: 'insurance', key: 'driverDocInsurance' },
  { id: 'profile_photo', key: 'driverDocProfilePhoto' },
  { id: 'vehicle_photo', key: 'driverDocVehiclePhoto' },
];

const STATUS_COLORS: Record<DriverDocument['status'], string> = {
  pending: Colors.warning,
  approved: Colors.primary,
  rejected: Colors.danger,
  expired: Colors.danger,
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
  const { contentStyle } = useResponsive();
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState<DriverDocument['docType'] | null>(null);
  const [fileName, setFileName] = useState('');
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
    <SafeAreaViewPlaceholder className="flex-1 bg-surface">
      <KeyboardFormScrollView horizontalPadding={0} bottomPadding={40}>
        <View style={contentStyle} className="px-5">
        <ScreenHeader back title={t('documents')} />
        <Text className="mt-1 text-subhead text-fg-muted">{t('driverDocumentsIntro')}</Text>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <View className="mt-6 gap-3">
            <ErrorMessage message={error} />
            <Button title={t('tryAgain')} variant="outline" onPress={load} />
          </View>
        ) : documents.length === 0 ? (
          <EmptyState compact icon="document-text-outline" title={t('driverNoDocumentsYet')} />
        ) : (
          <View className="mt-5 gap-2.5">
            {documents.map((doc) => (
              <View key={doc.id} className="flex-row items-center justify-between rounded-xl border border-border p-3.5">
                <View>
                  <Text className="text-subhead font-semibold text-fg">
                    {t((DOC_TYPES.find((d) => d.id === doc.docType)?.key ?? 'driverDocOther') as any)}
                  </Text>
                  {doc.fileName ? <Text className="mt-0.5 text-caption text-fg-muted">{doc.fileName}</Text> : null}
                </View>
                <Text className="text-caption font-semibold" style={{ color: STATUS_COLORS[doc.status] }}>{t(STATUS_KEYS[doc.status] as any)}</Text>
              </View>
            ))}
          </View>
        )}

        <Text className="mt-7 text-body font-bold text-fg">{t('driverAddDocument')}</Text>
        <View className="mt-3 flex-row flex-wrap gap-2">
          {DOC_TYPES.map((docTypeOption) => (
            <Chip key={docTypeOption.id} label={t(docTypeOption.key as any)} selected={docType === docTypeOption.id} onPress={() => setDocType(docTypeOption.id)} />
          ))}
        </View>

        <View className="mt-4 gap-3">
          <Input label={t('driverFileReference')} placeholder={t('driverFileReferencePlaceholder')} value={fileName} onChangeText={setFileName} prefixIcon="document-attach-outline" />
          {error ? <ErrorMessage message={error} /> : null}
        </View>

        <View className="mt-4 flex-row items-center rounded-xl bg-surface-muted p-3">
          <Ionicons name="camera-outline" size={18} color={Colors['fg-muted']} />
          <Text className="ml-2 flex-1 text-caption text-fg-muted">{t('driverCameraComingSoon')}</Text>
        </View>

        <View className="mt-4">
          <Button title={t('driverSubmitDocument')} onPress={handleSubmit} loading={submitting} />
        </View>
        </View>
      </KeyboardFormScrollView>
    </SafeAreaViewPlaceholder>
  );
}
