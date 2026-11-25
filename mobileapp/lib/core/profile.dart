import 'dart:convert';
import 'package:cryptography/cryptography.dart';
import 'package:flutter/foundation.dart';
import 'api.dart';
import 'models.dart';

const responseEncryptionKey = String.fromEnvironment('RESPONSE_ENCRYPTION_KEY',
    defaultValue: kDebugMode
        ? 'bGw/AmkqRg28jJBbPpTfzojFNahlxyOYXOgmKcZh+DLVB1bDjlCRriLZQpWEHssh'
        : '');

/// The backend packs each field as base64(nonce + ciphertext + GCM tag).
Future<Staff> decodeStaffProfile(Json response, {String username = ''}) async {
  if (responseEncryptionKey.trim().isEmpty) {
    throw const ApiException(
        'The app needs the restaurant profile key. Contact your administrator.');
  }
  try {
    final digest =
        await Sha256().hash(utf8.encode(responseEncryptionKey.trim()));
    final key = SecretKey(digest.bytes);
    Future<String> decrypt(dynamic value) async {
      final payload = base64Decode(value as String);
      if (payload.length < 28) throw const FormatException('Invalid profile');
      final clear = await AesGcm.with256bits().decrypt(
          SecretBox(payload.sublist(12, payload.length - 16),
              nonce: payload.sublist(0, 12),
              mac: Mac(payload.sublist(payload.length - 16))),
          secretKey: key);
      return utf8.decode(clear);
    }

    final fields = await Future.wait([
      decrypt(response['id']),
      decrypt(response['fullName']),
      decrypt(response['role']),
      decrypt(response['permissions'])
    ]);
    return Staff.fromJson({
      'id': fields[0], 'fullName': fields[1], 'role': fields[2],
      'permissions': jsonDecode(fields[3]), 'username': username,
      // /auth/me succeeds only for an active staff account.
      'isActive': true,
    });
  } catch (_) {
    throw const ApiException(
        'Could not read your staff profile. Check that the app profile key matches the restaurant server.');
  }
}
