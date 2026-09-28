import { useState } from 'react';
import { View, Text } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaViewPlaceholder } from '../components/SafeAreaViewPlaceholder';

import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ErrorMessage } from '../components/ErrorMessage';
import { useDriverAuthStore } from '../stores/useDriverAuthStore';
import { useTranslation } from '../hooks/useTranslation';
import { ApiError } from '../services/driver-api-client';

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// Driver-side counterpart to app/profile-setup.tsx — gates entry into
// (driver) until the essentials are filled in. The backend's is_profile_
// complete gate (driverProfile.routes.js's PUT /me) requires fullName +
// email, which registration never collects, so this screen also doubles as
// "tell us about your vehicle" since a driver with no vehicle info on file
// is useless to the matcher (driverMatcher.js denormalises vehicle_model/
// vehicle_color/vehicle_plate straight from the drivers row onto the ride).
export default function DriverProfileSetupScreen() {
  const { t } = useTranslation();
  const currentDriver = useDriverAuthStore((s) => s.currentDriver);
  const updateProfile = useDriverAuthStore((s) => s.updateProfile);

  const [fullName, setFullName] = useState(currentDriver?.fullName ?? '');
  const [email, setEmail] = useState(currentDriver?.email ?? '');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    if (!fullName.trim()) return setError(t('driverEnterFullName'));
    if (!email.trim()) return setError(t('driverEnterEmail'));
    setError(undefined);
    setLoading(true);
    try {
      await updateProfile({
        fullName: fullName.trim(),
        email: email.trim(),
        vehicleMake: vehicleMake.trim() || undefined,
        vehicleModel: vehicleModel.trim() || undefined,
        vehicleColor: vehicleColor.trim() || undefined,
        vehiclePlate: vehiclePlate.trim() || undefined,
      });
      // Root layout's Stack.Protected swaps to (driver) once
      // currentDriver.isProfileComplete becomes true.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('driverProfileSaveFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow px-6 pt-6 pb-8">
        <Text className="text-xl font-bold text-ink">{t('driverCompleteProfile')}</Text>

        <View className="mt-6 items-center">
          <View
            className="h-[88px] w-[88px] items-center justify-center rounded-full border-2 border-primary"
            style={{ backgroundColor: 'rgba(22,163,74,0.12)' }}
          >
            <Text className="text-3xl font-bold text-primary">{initialsFor(fullName)}</Text>
          </View>
        </View>

        <View className="mt-6 gap-4">
          <Input label={t('fullName')} value={fullName} onChangeText={setFullName} prefixIcon="person-outline" />
          <Input
            label={t('email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            prefixIcon="mail-outline"
          />
        </View>

        <Text className="mt-7 text-base font-bold text-ink">{t('driverYourVehicle')}</Text>
        <Text className="mt-1.5 text-xs leading-5 text-text-secondary">{t('driverVehicleHint')}</Text>
        <View className="mt-4 gap-4">
          <Input label={t('driverMake')} value={vehicleMake} onChangeText={setVehicleMake} prefixIcon="car-outline" />
          <Input label={t('driverModel')} value={vehicleModel} onChangeText={setVehicleModel} prefixIcon="car-sport-outline" />
          <Input label={t('driverColor')} value={vehicleColor} onChangeText={setVehicleColor} prefixIcon="color-palette-outline" />
          <Input label={t('driverPlateNumber')} value={vehiclePlate} onChangeText={setVehiclePlate} autoCapitalize="characters" prefixIcon="card-outline" />
          {error ? <ErrorMessage message={error} /> : null}
        </View>

        <View className="mt-7">
          <Button title={t('continueLabel')} onPress={handleContinue} loading={loading} />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaViewPlaceholder>
  );
}
