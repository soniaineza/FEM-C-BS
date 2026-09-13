import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/routes/app_routes.dart';
import '../../models/ride.dart';
import '../../services/ride_service.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/ride_card.dart';

enum _HistoryFilter { all, completed, cancelled }

/// Passenger ride history (step 23).
///
/// Rides come from the backend. Until then the empty state is shown honestly —
/// history is never populated with fake trips.
class RideHistoryScreen extends StatefulWidget {
  const RideHistoryScreen({super.key});

  @override
  State<RideHistoryScreen> createState() => _RideHistoryScreenState();
}

class _RideHistoryScreenState extends State<RideHistoryScreen> {
  _HistoryFilter _filter = _HistoryFilter.all;
  List<Ride>? _rides;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _rides = null;
      _error = false;
    });
    try {
      final rides = await rideService.getRideHistory();
      if (!mounted) return;
      setState(() => _rides = rides);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = true);
    }
  }

  List<Ride> get _visible {
    final rides = _rides ?? const <Ride>[];
    return switch (_filter) {
      _HistoryFilter.all => rides,
      _HistoryFilter.completed =>
        rides.where((r) => r.status == RideStatus.completed).toList(),
      _HistoryFilter.cancelled =>
        rides.where((r) => r.status == RideStatus.cancelled).toList(),
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.lightBackground,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 16, 20, 4),
              child: Text(
                'Ride history',
                style: TextStyle(
                  color: AppColors.black,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 4),
              child: _FilterBar(
                filter: _filter,
                onChanged: (f) => setState(() => _filter = f),
              ),
            ),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_error) {
      return Center(
        child: EmptyState(
          icon: Icons.error_outline,
          title: 'Could not load your rides',
          subtitle: 'Ride history will be available when the backend is '
              'connected.',
          actionLabel: 'Try again',
          onAction: _load,
          compact: true,
        ),
      );
    }

    if (_rides == null) {
      return const Center(child: CircularProgressIndicator());
    }

    final rides = _visible;
    if (rides.isEmpty && _rides!.isEmpty) {
      return const EmptyState(
        icon: Icons.history,
        title: 'No rides yet',
        subtitle: 'Your completed trips will appear here.',
      );
    }
    if (rides.isEmpty) {
      return const EmptyState(
        icon: Icons.filter_alt_off_outlined,
        title: 'Nothing here',
        subtitle: 'No rides match this filter.',
        compact: true,
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        itemCount: rides.length,
        itemBuilder: (context, i) {
          final ride = rides[i];
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: RideCard(
              ride: ride,
              onTap: () => Navigator.of(context).pushNamed(
                AppRoutes.rideDetails,
                arguments: ride,
              ),
            ),
          );
        },
      ),
    );
  }
}

class _FilterBar extends StatelessWidget {
  const _FilterBar({required this.filter, required this.onChanged});

  final _HistoryFilter filter;
  final ValueChanged<_HistoryFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _FilterChip(
          label: 'All',
          selected: filter == _HistoryFilter.all,
          onTap: () => onChanged(_HistoryFilter.all),
        ),
        const SizedBox(width: 8),
        _FilterChip(
          label: 'Completed',
          selected: filter == _HistoryFilter.completed,
          onTap: () => onChanged(_HistoryFilter.completed),
        ),
        const SizedBox(width: 8),
        _FilterChip(
          label: 'Cancelled',
          selected: filter == _HistoryFilter.cancelled,
          onTap: () => onChanged(_HistoryFilter.cancelled),
        ),
      ],
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.primaryGreen : AppColors.white,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selected ? AppColors.primaryGreen : AppColors.border,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? AppColors.white : AppColors.black,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}