import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:u_scholar/main.dart';

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
  });
  testWidgets('discover and account gate render on a narrow screen', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const ScholarApp());
    await tester.pumpAndSettle();
    expect(find.text('What do you want to learn?'), findsOneWidget);
    await tester.tap(find.text('My tracks'));
    await tester.pumpAndSettle();
    expect(find.text('Keep your journey together.'), findsOneWidget);
    await tester.tap(find.text('Sign in or create account'));
    await tester.pumpAndSettle();
    expect(find.text('Create account'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
