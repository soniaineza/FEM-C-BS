import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { KeyboardFormScrollView } from '../components/layout/KeyboardFormScrollView';
import { SafeAreaViewPlaceholder } from '../components/SafeAreaViewPlaceholder';

import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ErrorMessage } from '../components/ErrorMessage';
import { useDriverAuthStore } from '../stores/useDriverAuthStore';
import { updateDriverVehicle } from '../services/driver-profile-service';
import { useTranslation } from '../hooks/useTranslation';
import { ApiError } from '../services/driver-api-client';
import { Colors } from '../constants/theme';
import { CAR_COLOR_NAMES } from '../components/map/map-types';
import { Avatar, ScreenHeader, Text } from '../components/ui';

// Driver-side counterpart to app/profile-setup.tsx — gates entry into
// (driver) until the essentials are filled in. The backend's is_profile_
// complete gate (driverProfile.routes.js's PUT /me) requires fullName +
// email, which registration never collects, so this screen also doubles as
// "tell us about your vehicle" since a driver with no vehicle info on file
// is useless to the matcher (driverMatcher.js denormalises vehicle_model/
// vehicle_color/vehicle_plate straight from the drivers row onto the ride).
// Colour names the map's 3D cars know how to paint (carModel.ts).
const VEHICLE_COLORS = ['White', 'Silver', 'Grey', 'Black', 'Red', 'Blue', 'Green', 'Yellow'].map((name) => ({
  name,
  hex: CAR_COLOR_NAMES[name.toLowerCase()],
}));

export default function DriverProfileSetupScreen() {
  const { t } = useTranslation();
  const currentDriver = useDriverAuthStore((s) => s.currentDriver);
  const updateProfile = useDriverAuthStore((s) => s.updateProfile);

  const [fullName, setFullName] = useState(currentDriver?.fullName ?? '');
  const [email, setEmail] = useState(currentDriver?.email ?? '');
  const [vehicleMake, setVehicleMake] = useState(currentDriver?.vehicleMake ?? '');
  const [vehicleModel, setVehicleModel] = useState(currentDriver?.vehicleModel ?? '');
  const [vehicleColor, setVehicleColor] = useState(currentDriver?.vehicleColor ?? 'White');
  const [vehiclePlate, setVehiclePlate] = useState(currentDriver?.vehiclePlate ?? '');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    if (!fullName.trim()) return setError(t('driverEnterFullName'));
    if (!email.trim()) return setError(t('driverEnterEmail'));
    if (!vehicleMake.trim() || !vehicleModel.trim() || !vehiclePlate.trim()) return setError(t('driverEnterVehicle'));
    setError(undefined);
    setLoading(true);
    try {
      // PUT /driver/me rejects vehicle keys, so the vehicle goes through its
      // own endpoint FIRST: a failure surfaces here instead of after the
      // profile gate flips below.
      await updateDriverVehicle({
        vehicleMake: vehicleMake.trim(),
        vehicleModel: vehicleModel.trim(),
        vehicleColor: vehicleColor.trim(),
        vehiclePlate: vehiclePlate.trim().toUpperCase(),
      });
      await updateProfile({ fullName: fullName.trim(), email: email.trim() });
      // Root layout's Stack.Protected swaps to (driver) once
      // currentDriver.isProfileComplete becomes true.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('driverProfileSaveFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-surface">
      <KeyboardFormScrollView topPadding={16}>
        <ScreenHeader title={t('driverCompleteProfile')} subtitle={t('driverVehicleHint')} />

        <View className="mt-4 items-center">
          <Avatar name={fullName} size={80} />
        </View>

        <Text variant="footnote" weight="semibold" tone="muted" style={SECTION}>{t('driverSetupStepProfile')}</Text>
        <View className="gap-4">
          <Input label={t('fullName')} value={fullName} onChangeText={setFullName} prefixIcon="person-outline" autoComplete="name" />
          <Input
            label={t('email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            prefixIcon="mail-outline"
          />
        </View>

        <Text variant="footnote" weight="semibold" tone="muted" style={SECTION}>{t('driverSetupStepVehicle')}</Text>
        <View className="gap-4">
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Input label={t('driverMake')} value={vehicleMake} onChangeText={setVehicleMake} placeholder="Toyota" />
            </View>
            <View className="flex-1">
              <Input label={t('driverModel')} value={vehicleModel} onChangeText={setVehicleModel} placeholder="Corolla" />
            </View>
          </View>
          <Input
            label={t('driverPlateNumber')}
            value={vehiclePlate}
            onChangeText={setVehiclePlate}
            autoCapitalize="characters"
            placeholder="RAE 123 T"
            prefixIcon="card-outline"
          />
          <View>
            <Text variant="subhead" weight="medium" style={{ marginBottom: 8 }}>{t('driverColor')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {VEHICLE_COLORS.map((c) => {
                const selected = vehicleColor.toLowerCase() === c.name.toLowerCase();
                return (
                  <Pressable
                    key={c.name}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={c.name}
                    onPress={() => setVehicleColor(c.name)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      minHeight: 40,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1.5,
                      borderColor: selected ? Colors.primary : Colors.border,
                      backgroundColor: selected ? Colors['primary-soft'] : Colors.surface,
                    }}
                  >
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c.hex, borderWidth: 1, borderColor: Colors['border-strong'] }} />
                    <Text variant="subhead" weight={selected ? 'semibold' : 'medium'}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {error ? <ErrorMessage message={error} /> : null}
        </View>

        <View className="mt-8">
          <Button title={t('continueLabel')} iconRight="arrow-forward" onPress={handleContinue} loading={loading} />
        </View>
      </KeyboardFormScrollView>
    </SafeAreaViewPlaceholder>
  );
}

const SECTION = { marginTop: 28, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: 0.6 };
