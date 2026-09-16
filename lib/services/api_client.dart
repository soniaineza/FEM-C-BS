import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../core/constants/app_constants.dart';
import '../core/errors/app_exception.dart';

/// Minimal HTTP client for the FEM C@BS API.
///
/// Adds the `Authorization: Bearer <token>` header when a session token is
/// stored, and maps backend error responses into [AppException] so every
/// service surfaces friendly messages instead of raw network errors.
class ApiClient {
  final http.Client _client = http.Client();

  bool get isConnected => AppConstants.backendConnected;

  Uri _uri(String path) {
    final base = AppConstants.backendBaseUrl.replaceAll(RegExp(r'/$'), '');
    final normalized = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$base$normalized');
  }

  Future<String?> _readToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(AppConstants.prefAuthTokenKey);
  }

  Future<Map<String, String>> _headers() async {
    final token = await _readToken();
    return {
      'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  /// Stores the auth token + passenger id used by the authenticated calls.
  Future<void> saveSession({
    required String token,
    required String passengerId,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AppConstants.prefAuthTokenKey, token);
    await prefs.setString(AppConstants.prefAuthPassengerIdKey, passengerId);
  }

  Future<String?> get savedPassengerId async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(AppConstants.prefAuthPassengerIdKey);
  }

  Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.prefAuthTokenKey);
    await prefs.remove(AppConstants.prefAuthPassengerIdKey);
  }

  Future<Map<String, dynamic>> get(String path) async =>
      _send('GET', path, headers: await _headers());

  Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? body,
    bool auth = true,
  }) async =>
      _send(
        'POST',
        path,
        body: body,
        headers: await (auth ? _headers() : _publicHeaders()),
      );

  Future<Map<String, dynamic>> put(
    String path, {
    Map<String, dynamic>? body,
  }) async =>
      _send('PUT', path, body: body, headers: await _headers());

  Future<Map<String, dynamic>> delete(String path) async =>
      _send('DELETE', path, headers: await _headers());

  Future<Map<String, String>> _publicHeaders() async =>
      {'Content-Type': 'application/json'};

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
        _ => throw UnsupportedError('Method $method is not supported.'),
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
      final message = json?['message'] as String? ??
          'Something went wrong. Please try again.';
      throw AppException(message);
    }
    return json ?? {};
  }
}

/// App-wide API client instance.
final ApiClient apiClient = ApiClient();