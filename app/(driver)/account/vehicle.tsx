import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { router } from 'expo-router';

import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { ErrorMessage } from '../../../components/ErrorMessage';
import { BackHeader } from '../../../components/BackHeader';
import { useTranslation } from '../../../hooks/useTranslation';
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

  useEffect(() => {
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
      .finally(() => setLoading(false));
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
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('driverVehicleSaveFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !vehicle) {
    return (
      <SafeAreaViewPlaceholder className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#16A34A" />
      </SafeAreaViewPlaceholder>
    );
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-6 pt-2 pb-10" keyboardShouldPersistTaps="handled">
        <BackHeader />
        <Text className="mt-2 text-xl font-bold text-ink">{t('driverYourVehicle')}</Text>

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
      </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}
