import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/localization/app_localizations.dart';
import '../../../widgets/primary_button.dart';
import '../../../widgets/custom_text_field.dart';
import '../../services/driver_api_client.dart';
import '../../services/driver_auth_service.dart';

/// Vehicle information management for the driver.
class DriverVehicleScreen extends StatefulWidget {
  const DriverVehicleScreen({super.key});

  @override
  State<DriverVehicleScreen> createState() => _DriverVehicleScreenState();
}

class _DriverVehicleScreenState extends State<DriverVehicleScreen> {
  final _makeController = TextEditingController();
  final _modelController = TextEditingController();
  final _yearController = TextEditingController();
  final _colorController = TextEditingController();
  final _plateController = TextEditingController();
  final _licenseController = TextEditingController();
  bool _loading = false;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _makeController.dispose();
    _modelController.dispose();
    _yearController.dispose();
    _colorController.dispose();
    _plateController.dispose();
    _licenseController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await driverApiClient.get('driver/vehicle');
      final v = data['vehicle'] as Map<String, dynamic>? ?? {};
      _makeController.text = v['make'] as String? ?? '';
      _modelController.text = v['model'] as String? ?? '';
      _yearController.text = (v['year'] ?? '').toString();
      _colorController.text = v['color'] as String? ?? '';
      _plateController.text = v['plate'] as String? ?? '';
      _licenseController.text = v['licenseNumber'] as String? ?? '';
      if (mounted) setState(() => _loaded = true);
    } catch (_) {
      if (mounted) setState(() => _loaded = true);
    }
  }

  Future<void> _save() async {
    setState(() => _loading = true);
    try {
      await driverApiClient.put('driver/me', body: {
        'vehicleMake': _makeController.text.trim(),
        'vehicleModel': _modelController.text.trim(),
        'vehicleYear': int.tryParse(_yearController.text.trim()),
        'vehicleColor': _colorController.text.trim(),
        'vehiclePlate': _plateController.text.trim(),
        'licenseNumber': _licenseController.text.trim(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Vehicle info updated')),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      appBar: AppBar(title: Text(l10n.vehicleInfo)),
      body: !_loaded
          ? const Center(child: CircularProgressIndicator(color: AppColors.primaryGreen))
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                CustomTextField(controller: _makeController, label: 'Make'),
                const SizedBox(height: 14),
                CustomTextField(controller: _modelController, label: 'Model'),
                const SizedBox(height: 14),
                CustomTextField(controller: _yearController, label: 'Year',
                  keyboardType: TextInputType.number),
                const SizedBox(height: 14),
                CustomTextField(controller: _colorController, label: 'Color'),
                const SizedBox(height: 14),
                CustomTextField(controller: _plateController, label: 'License plate'),
                const SizedBox(height: 14),
                CustomTextField(controller: _licenseController, label: 'License number'),
                const SizedBox(height: 24),
                PrimaryButton(
                  label: l10n.saveChanges,
                  loading: _loading,
                  onPressed: _loading ? null : _save,
                ),
              ],
            ),
    );
  }
}
