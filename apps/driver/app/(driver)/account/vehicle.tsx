import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';
import { goBack } from '@kimu/shared/utils/navigation';

import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { ErrorMessage } from '@kimu/shared/components/ErrorMessage';
import { BackHeader } from '@kimu/shared/components/BackHeader';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { getDriverVehicle, updateDriverVehicle, DriverVehicleInfo } from '../../../services/driver-profile-service';
import { ApiError } from '../../../services/driver-api-client';

export default function DriverVehicleScreen() {
  const { t } = useTranslation();
  const [vehicle, setVehicle] = useState<DriverVehicleInfo | null>(null);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [plate, setPlate] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  function load() {
    setLoading(true);
    setError(undefined);
    getDriverVehicle()
      .then((v) => {
        setVehicle(v);
        setMake(v.make);
        setModel(v.model);
        setYear(v.year ? String(v.year) : '');
        setColor(v.color);
        setPlate(v.plate);
        setLicenseNumber(v.licenseNumber);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t('requestFailed')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    const parsedYear = year.trim() ? Number(year.trim()) : undefined;
    if (year.trim() && (!Number.isInteger(parsedYear) || parsedYear! < 1980)) {
      return setError(t('driverInvalidYear'));
    }
    setError(undefined);
    setSaving(true);
    try {
      await updateDriverVehicle({
        vehicleMake: make.trim() || undefined,
        vehicleModel: model.trim() || undefined,
        vehicleYear: parsedYear,
        vehicleColor: color.trim() || undefined,
        vehiclePlate: plate.trim() || undefined,
        licenseNumber: licenseNumber.trim() || undefined,
      });
      goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('driverVehicleSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !vehicle) {
    return (
      <SafeAreaViewPlaceholder className="flex-1 bg-white">
        <View className="flex-1 px-6 pt-2">
          <BackHeader />
          {loading ? <ActivityIndicator className="mt-10" color="#0E7C4A" /> : (
            <View className="mt-10 gap-4">
              <ErrorMessage message={error ?? t('requestFailed')} />
              <Button title={t('tryAgain')} variant="outline" onPress={load} />
            </View>
          )}
        </View>
      </SafeAreaViewPlaceholder>
    );
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="px-6 pt-2 pb-10">
        <BackHeader />
        <Text className="mt-2 text-xl text-ink font-display">{t('driverYourVehicle')}</Text>

        <View className="mt-6 gap-4">
          <Input label={t('driverMake')} value={make} onChangeText={setMake} prefixIcon="car-outline" />
          <Input label={t('driverModel')} value={model} onChangeText={setModel} prefixIcon="car-sport-outline" />
          <Input label={t('driverYear')} value={year} onChangeText={setYear} keyboardType="number-pad" prefixIcon="calendar-outline" />
          <Input label={t('driverColor')} value={color} onChangeText={setColor} prefixIcon="color-palette-outline" />
          <Input label={t('driverPlateNumber')} value={plate} onChangeText={setPlate} autoCapitalize="characters" prefixIcon="card-outline" />
          <Input label={t('driverLicenseNumber')} value={licenseNumber} onChangeText={setLicenseNumber} prefixIcon="document-text-outline" />
          {error ? <ErrorMessage message={error} /> : null}
        </View>

        <View className="mt-7">
          <Button title={t('save')} onPress={handleSave} loading={saving} />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaViewPlaceholder>
  );
}
