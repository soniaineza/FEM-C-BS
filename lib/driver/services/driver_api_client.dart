import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/constants/app_constants.dart';
import '../../core/errors/app_exception.dart';

/// API client for the FEM C@BS driver side.
/// Uses the same backend as the passenger app, but with driver authentication.
class DriverApiClient {
  final http.Client _client = http.Client();

  bool get isConnected => AppConstants.backendConnected;

  Uri _uri(String path) {
    final base = AppConstants.backendBaseUrl.replaceAll(RegExp(r'/$'), '');
    final normalized = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$base$normalized');
  }

  Future<String?> readToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

  Future<Map<String, String>> _headers() async {
    final token = await readToken();
    return {
      'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  Future<void> saveSession({required String token, required String driverId}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
    await prefs.setString(_driverIdKey, driverId);
  }

  Future<String?> get savedDriverId async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_driverIdKey);
  }

  Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_driverIdKey);
  }

  Future<Map<String, dynamic>> get(String path) async =>
      _send('GET', path, headers: await _headers());

  Future<Map<String, dynamic>> post(String path, {Map<String, dynamic>? body}) async =>
      _send('POST', path, body: body, headers: await _headers());

  Future<Map<String, dynamic>> put(String path, {Map<String, dynamic>? body}) async =>
      _send('PUT', path, body: body, headers: await _headers());

  Future<Map<String, dynamic>> delete(String path) async =>
      _send('DELETE', path, headers: await _headers());

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? headers,
  }) async {
    if (!isConnected) {
      throw BackendNotConnectedException('Request to $path');
    }
    final uri = _uri(path);
    final encoded = body == null ? null : jsonEncode(body);

    http.Response response;
    try {
      response = switch (method) {
        'GET' => await _client.get(uri, headers: headers),
        'POST' => await _client.post(uri, headers: headers, body: encoded),
        'PUT' => await _client.put(uri, headers: headers, body: encoded),
        'DELETE' => await _client.delete(uri, headers: headers),
        _ => throw UnsupportedError('Method $method not supported.'),
      };
    } catch (_) {
      throw const AppException(
        'We could not reach the FEM C@BS servers. Check your connection and try again.',
      );
    }

    final ok = response.statusCode >= 200 && response.statusCode < 300;
    Map<String, dynamic>? json;
    if (response.body.isNotEmpty) {
      try {
        json = jsonDecode(response.body) as Map<String, dynamic>;
      } catch (_) {
        json = null;
      }
    }
    if (!ok) {
      final message = json?['message'] as String? ?? 'Something went wrong. Please try again.';
      throw AppException(message);
    }
    return json ?? {};
  }

  static const _tokenKey = 'driver_auth_token';
  static const _driverIdKey = 'driver_auth_id';
}

final DriverApiClient driverApiClient = DriverApiClient();
