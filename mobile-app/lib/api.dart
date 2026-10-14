import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class Api {
  static const base = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://localhost:3000/api',
  );
  final storage = const FlutterSecureStorage();
  String? token;
  Future<void> restore() async => token = await storage.read(key: 'session');
  Future<dynamic> request(
    String method,
    String path, [
    Map<String, dynamic>? body,
  ]) async {
    final req = http.Request(method, Uri.parse('$base/$path'));
    req.headers['Content-Type'] = 'application/json';
    if (token != null) req.headers['Authorization'] = 'Bearer $token';
    if (body != null) req.body = jsonEncode(body);
    final response = await http.Response.fromStream(
      await req.send().timeout(const Duration(seconds: 200)),
    );
    dynamic data;
    try {
      data = jsonDecode(response.body);
    } catch (_) {
      throw Exception(
        'The server could not process this request. Please retry.',
      );
    }
    if (response.statusCode >= 400) {
      if (response.statusCode == 401) {
        token = null;
        await storage.delete(key: 'session');
      }
      throw Exception(
        data is Map ? data['message'] ?? 'Request failed' : 'Request failed',
      );
    }
    return data;
  }

  Future<void> saveToken(String value) async {
    token = value;
    await storage.write(key: 'session', value: value);
  }

  Future<void> clear() async {
    token = null;
    await storage.delete(key: 'session');
  }
}
