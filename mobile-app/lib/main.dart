import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api.dart';

void main() => runApp(const ScholarApp());

class ScholarApp extends StatelessWidget {
  const ScholarApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'U-Scholar',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff246b56)),
      scaffoldBackgroundColor: const Color(0xfff5f6f0),
      inputDecorationTheme: const InputDecorationTheme(
        border: OutlineInputBorder(),
        filled: true,
        fillColor: Colors.white,
      ),
      cardTheme: const CardThemeData(
        elevation: 0,
        margin: EdgeInsets.symmetric(vertical: 8),
      ),
    ),
    home: const LearningHome(),
  );
}

class LearningHome extends StatefulWidget {
  const LearningHome({super.key});
  @override
  State<LearningHome> createState() => _LearningHomeState();
}

class _LearningHomeState extends State<LearningHome> {
  final api = Api();
  final topic = TextEditingController();
  Map<String, dynamic>? user, assessment, result, selected;
  List<dynamic> tracks = [];
  List<int?> answers = [];
  bool busy = true;
  String? error;
  int page = 0;
  @override
  void initState() {
    super.initState();
    run(() async {
      await api.restore();
      if (api.token != null) await refresh();
    });
  }

  @override
  void dispose() {
    topic.dispose();
    super.dispose();
  }

  Future<void> run(Future<void> Function() action) async {
    if (mounted) {
      setState(() {
        busy = true;
        error = null;
      });
    }
    try {
      await action();
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString().replaceFirst('Exception: ', '');
          if (api.token == null) user = null;
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> refresh() async {
    user = Map<String, dynamic>.from(await api.request('GET', 'me'));
    tracks = await api.request('GET', 'tracks');
    if (selected != null) {
      final match = tracks.where((t) => t['id'] == selected!['id']);
      if (match.isNotEmpty) selected = Map<String, dynamic>.from(match.first);
    }
  }

  Future<void> generate() async {
    selected = Map<String, dynamic>.from(
      await api.request('POST', 'tracks', {'assessmentId': assessment!['id']}),
    );
    await refresh();
    assessment = null;
    result = null;
    page = 1;
  }

  Future<void> auth() async {
    final value = await showDialog<Map<String, String>>(
      context: context,
      builder: (_) => const AuthDialog(),
    );
    if (value == null) return;
    await run(() async {
      final data = await api.request(
        'POST',
        'auth/${value.containsKey('name') ? 'register' : 'login'}',
        value,
      );
      await api.saveToken(data['token']);
      await refresh();
      if (result != null) await generate();
    });
  }

  Widget button(
    String label,
    VoidCallback action, {
    IconData icon = Icons.arrow_forward,
  }) => FilledButton.icon(
    onPressed: busy ? null : action,
    icon: Icon(icon, size: 18),
    label: Text(label),
  );
  Widget title(String eyebrow, String heading, String body) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        eyebrow.toUpperCase(),
        style: const TextStyle(
          letterSpacing: 2,
          color: Color(0xff246b56),
          fontWeight: FontWeight.w700,
        ),
      ),
      const SizedBox(height: 12),
      Text(
        heading,
        style: const TextStyle(
          fontSize: 34,
          fontWeight: FontWeight.w800,
          height: 1.15,
        ),
      ),
      const SizedBox(height: 12),
      Text(
        body,
        style: const TextStyle(
          fontSize: 16,
          color: Colors.black54,
          height: 1.5,
        ),
      ),
      const SizedBox(height: 24),
    ],
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text(
        '◈  U-Scholar',
        style: TextStyle(fontWeight: FontWeight.w800),
      ),
      backgroundColor: const Color(0xfff5f6f0),
      actions: [
        if (user == null)
          TextButton(
            onPressed: busy ? null : auth,
            child: const Text('Sign in'),
          )
        else
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text('${user!['xp']} XP  •  Lv ${user!['level']}'),
          ),
      ],
    ),
    bottomNavigationBar: NavigationBar(
      selectedIndex: page,
      onDestinationSelected: busy ? null : (v) => setState(() => page = v),
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.explore_outlined),
          label: 'Discover',
        ),
        NavigationDestination(
          icon: Icon(Icons.route_outlined),
          label: 'My tracks',
        ),
        NavigationDestination(
          icon: Icon(Icons.person_outline),
          label: 'Profile',
        ),
      ],
    ),
    body: Column(
      children: [
        if (busy) const LinearProgressIndicator(),
        if (error != null)
          MaterialBanner(
            content: Text(error!),
            actions: [
              TextButton(
                onPressed: () => setState(() => error = null),
                child: const Text('Dismiss'),
              ),
            ],
          ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 850),
                child: page == 0
                    ? discover()
                    : page == 1
                    ? trackPage()
                    : profilePage(),
              ),
            ),
          ),
        ),
      ],
    ),
  );
  Widget discover() {
    if (result != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          title(
            'Your starting point',
            'A path built around you.',
            'Your weakest skills come first, with prerequisites kept in order. This short assessment is a starting estimate, not proof of mastery.',
          ),
          if (result!['demo'] == true)
            const Text(
              'DEMO • Self-reported confidence, not an objective assessment.',
            ),
          ...(result!['scores'] as List).map(
            (s) => Card(
              child: ListTile(
                title: Text(s['skill']),
                subtitle: LinearProgressIndicator(value: s['score'] / 100),
                trailing: Text('${s['score']}%'),
              ),
            ),
          ),
          const SizedBox(height: 20),
          button(
            user == null
                ? 'Create account to reveal your track'
                : 'Discover my learning resources',
            () => user == null ? auth() : run(generate),
          ),
          TextButton(
            onPressed: busy
                ? null
                : () => setState(() {
                    result = null;
                    assessment = null;
                  }),
            child: const Text('Start another assessment'),
          ),
        ],
      );
    }
    if (assessment != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          title(
            'Skill check',
            assessment!['topic'],
            'Answer each question to find where to focus your learning.',
          ),
          if (assessment!['demo'] == true)
            const Text('DEMO MODE • These are sample self-rating questions.'),
          ...List.generate(answers.length, (i) {
            final q = assessment!['questions'][i];
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${i + 1}. ${q['question']}',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 12),
                    ...List.generate(
                      4,
                      (j) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: SizedBox(
                          width: double.infinity,
                          child: OutlinedButton(
                            onPressed: busy
                                ? null
                                : () => setState(() => answers[i] = j),
                            style: OutlinedButton.styleFrom(
                              alignment: Alignment.centerLeft,
                              backgroundColor: answers[i] == j
                                  ? const Color(0xffd9eadd)
                                  : null,
                              padding: const EdgeInsets.all(16),
                            ),
                            child: Text(
                              '${String.fromCharCode(65 + j)}. ${q['options'][j]}',
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
          button(
            'See my strengths & gaps',
            () => run(() async {
              if (answers.any((a) => a == null)) {
                throw Exception('Please answer every question.');
              }
              result = Map<String, dynamic>.from(
                await api.request(
                  'POST',
                  'assessments/${assessment!['id']}/answers',
                  {'answers': answers},
                ),
              );
            }),
          ),
          TextButton(
            onPressed: busy ? null : () => setState(() => assessment = null),
            child: const Text('Cancel'),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        title(
          'Learn with direction',
          'Big ambitions.\nOne clear next step.',
          'Discover your strengths, work on your gaps, and follow a personal learning track from the fundamentals to advanced practice.',
        ),
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: const Color(0xffe4ebdc),
            borderRadius: BorderRadius.circular(24),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'What do you want to learn?',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: topic,
                maxLength: 200,
                decoration: const InputDecoration(
                  hintText: 'e.g. Python, product design, data analysis',
                  labelText: 'Topic or skill',
                ),
                onSubmitted: busy ? null : (_) => start(),
              ),
              const SizedBox(height: 16),
              button('Find my starting point', start, icon: Icons.auto_awesome),
            ],
          ),
        ),
        const SizedBox(height: 28),
        ...[
          (
            Icons.psychology_outlined,
            '01 · Find your focus',
            'A short skill check reveals where to begin.',
          ),
          (
            Icons.route_outlined,
            '02 · Follow your path',
            'Resources from across the web, in a useful order.',
          ),
          (
            Icons.emoji_events_outlined,
            '03 · Build momentum',
            'Complete a step, earn XP, and unlock the next.',
          ),
        ].map(
          (item) => ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(item.$1),
            title: Text(item.$2),
            subtitle: Text(item.$3),
          ),
        ),
      ],
    );
  }

  void start() => run(() async {
    assessment = Map<String, dynamic>.from(
      await api.request('POST', 'assessments', {'topic': topic.text.trim()}),
    );
    answers = List.filled((assessment!['questions'] as List).length, null);
    result = null;
  });
  Widget trackPage() {
    if (user == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          title(
            'Your library',
            'Keep your journey together.',
            'Sign in to access your tracks, saved notes, and progress.',
          ),
          button('Sign in or create account', auth),
        ],
      );
    }
    if (selected == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          title(
            'Your library',
            'Learning, one step at a time.',
            'Pick up where you left off, or discover a new skill.',
          ),
          if (tracks.isEmpty)
            const Text('No tracks yet. Start a skill check in Discover.'),
          ...tracks.map(
            (t) => Card(
              child: ListTile(
                title: Text(t['topic']),
                subtitle: Text(
                  '${(t['resources'] as List).where((r) => r['completedAt'] != null).length} / ${(t['resources'] as List).length} steps complete',
                ),
                trailing: const Icon(Icons.arrow_forward),
                onTap: () =>
                    setState(() => selected = Map<String, dynamic>.from(t)),
              ),
            ),
          ),
        ],
      );
    }
    final resources = selected!['resources'] as List;
    final done = resources.where((r) => r['completedAt'] != null).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextButton.icon(
          onPressed: () => setState(() => selected = null),
          icon: const Icon(Icons.arrow_back),
          label: const Text('All tracks'),
        ),
        title(
          'Your learning track',
          selected!['topic'],
          '$done of ${resources.length} steps complete • ${done * 100} XP earned',
        ),
        if (selected!['demo'] == true)
          const Padding(
            padding: EdgeInsets.only(bottom: 16),
            child: Text(
              'DEMO • Links open provider search pages. Configure OpenAI for specific sourced resources.',
            ),
          ),
        LinearProgressIndicator(value: done / resources.length),
        const SizedBox(height: 20),
        ...List.generate(resources.length, (i) {
          final r = resources[i];
          final locked = i > 0 && resources[i - 1]['completedAt'] == null;
          final complete = r['completedAt'] != null;
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        child: Icon(
                          locked
                              ? Icons.lock_outline
                              : complete
                              ? Icons.check
                              : Icons.play_arrow,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          r['title'],
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 20,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    '${r['provider']} • ${r['level']} • ${r['clicks']} opens',
                  ),
                  const SizedBox(height: 8),
                  Text(r['reason']),
                  const SizedBox(height: 16),
                  if (locked)
                    const Text('Complete the previous step to unlock.')
                  else
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        button(
                          'Open resource',
                          () => run(() async {
                            if (!await launchUrl(
                              Uri.parse(r['url']),
                              mode: LaunchMode.externalApplication,
                            )) {
                              throw Exception('Unable to open the resource.');
                            }
                            await api.request(
                              'POST',
                              'tracks/${selected!['id']}/resources/${r['id']}/open',
                            );
                            await refresh();
                          }),
                          icon: Icons.open_in_new,
                        ),
                        OutlinedButton.icon(
                          onPressed: busy ? null : () => editNote(r),
                          icon: const Icon(Icons.edit_note),
                          label: const Text('Notes'),
                        ),
                        OutlinedButton.icon(
                          onPressed: busy || complete
                              ? null
                              : () => run(() async {
                                  await api.request(
                                    'POST',
                                    'tracks/${selected!['id']}/resources/${r['id']}/complete',
                                  );
                                  await refresh();
                                }),
                          icon: Icon(complete ? Icons.check : Icons.task_alt),
                          label: Text(
                            complete ? 'Completed' : 'Mark complete · +100 XP',
                          ),
                        ),
                      ],
                    ),
                  if (!locked && r['notes'] != '')
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Text('Your note: ${r['notes']}'),
                    ),
                ],
              ),
            ),
          );
        }),
        if (done == resources.length)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              '🏆 Track complete! Keep practicing and applying what you learned.',
              style: TextStyle(fontSize: 20),
            ),
          ),
      ],
    );
  }

  Future<void> editNote(dynamic r) async {
    final controller = TextEditingController(text: r['notes']);
    final note = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Learning notes'),
        content: SizedBox(
          width: 500,
          child: TextField(
            controller: controller,
            maxLines: 8,
            maxLength: 20000,
            decoration: const InputDecoration(
              hintText: 'Key ideas, questions, and things to practice',
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (note != null) {
      await run(() async {
        await api.request(
          'PUT',
          'tracks/${selected!['id']}/resources/${r['id']}/notes',
          {'notes': note},
        );
        await refresh();
      });
    }
  }

  Widget profilePage() {
    if (user == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          title(
            'Your space',
            'Make learning a habit.',
            'Save your progress and personalize your reminders.',
          ),
          button('Sign in or create account', auth),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        title(
          'Your space',
          'Hello, ${user!['name']}.',
          'Small, consistent steps add up.',
        ),
        Wrap(
          spacing: 16,
          runSpacing: 16,
          children: [
            stat('${user!['xp']}', 'Total XP'),
            stat('${user!['level']}', 'Level'),
            stat('${user!['streak']} days', 'UTC learning streak'),
          ],
        ),
        const SizedBox(height: 20),
        Text(
          'Badges: ${(user!['badges'] as List).isEmpty ? 'Complete your first resource to earn a badge.' : (user!['badges'] as List).join(' · ')}',
        ),
        const SizedBox(height: 24),
        Card(
          child: ListTile(
            leading: const Icon(Icons.notifications_active_outlined),
            title: const Text('Learning reminders'),
            subtitle: Text(
              user!['reminder']?['enabled'] == true
                  ? 'Enabled • ${user!['reminder']['timeUtc']} UTC'
                  : 'Email reminders are off',
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: busy ? null : reminders,
          ),
        ),
        const SizedBox(height: 24),
        OutlinedButton(
          onPressed: busy
              ? null
              : () => run(() async {
                  await api.request('POST', 'auth/logout');
                  await api.clear();
                  user = null;
                  tracks = [];
                  selected = null;
                  page = 0;
                }),
          child: const Text('Sign out'),
        ),
      ],
    );
  }

  Widget stat(String value, String label) => Container(
    width: 190,
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
        ),
        Text(label),
      ],
    ),
  );
  Future<void> reminders() async {
    final value = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => ReminderDialog(initial: user!['reminder']),
    );
    if (value != null) {
      await run(() async {
        await api.request('PUT', 'me/reminder', value);
        await refresh();
      });
    }
  }
}

class AuthDialog extends StatefulWidget {
  const AuthDialog({super.key});
  @override
  State<AuthDialog> createState() => _AuthDialogState();
}

class _AuthDialogState extends State<AuthDialog> {
  bool register = true;
  final form = GlobalKey<FormState>();
  final name = TextEditingController(),
      email = TextEditingController(),
      password = TextEditingController();
  @override
  void dispose() {
    name.dispose();
    email.dispose();
    password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(register ? 'Start your learning journey' : 'Welcome back'),
    content: SingleChildScrollView(
      child: SizedBox(
        width: 400,
        child: Form(
          key: form,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (register)
                TextFormField(
                  controller: name,
                  decoration: const InputDecoration(labelText: 'Name'),
                  validator: (s) =>
                      s!.trim().isEmpty ? 'Enter your name' : null,
                ),
              const SizedBox(height: 12),
              TextFormField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email'),
                validator: (s) =>
                    s!.contains('@') ? null : 'Enter an email address',
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: password,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Password (10+ characters)',
                ),
                validator: (s) =>
                    s!.length < 10 ? 'Use at least 10 characters' : null,
              ),
              TextButton(
                onPressed: () => setState(() => register = !register),
                child: Text(
                  register
                      ? 'Already registered? Sign in'
                      : 'New here? Create an account',
                ),
              ),
            ],
          ),
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: () {
          if (form.currentState!.validate()) {
            Navigator.pop(context, {
              'email': email.text.trim(),
              'password': password.text,
              if (register) 'name': name.text.trim(),
            });
          }
        },
        child: Text(register ? 'Create account' : 'Sign in'),
      ),
    ],
  );
}

class ReminderDialog extends StatefulWidget {
  final dynamic initial;
  const ReminderDialog({super.key, this.initial});
  @override
  State<ReminderDialog> createState() => _ReminderDialogState();
}

class _ReminderDialogState extends State<ReminderDialog> {
  late bool enabled;
  late TimeOfDay time;
  late Set<int> days;
  @override
  void initState() {
    super.initState();
    enabled = widget.initial?['enabled'] ?? false;
    final parts = (widget.initial?['timeUtc'] ?? '18:00').split(':');
    time = TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1]));
    days = Set<int>.from(widget.initial?['days'] ?? [1, 2, 3, 4, 5]);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Email reminders'),
    content: SizedBox(
      width: 400,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SwitchListTile(
            title: const Text('Remind me to learn'),
            value: enabled,
            onChanged: (v) => setState(() => enabled = v),
          ),
          const Text(
            'Times and days use UTC. 18:00 UTC is 19:00 in Lagos. The server must be running to send reminders.',
          ),
          TextButton(
            onPressed: () async {
              final t = await showTimePicker(
                context: context,
                initialTime: time,
              );
              if (t != null) setState(() => time = t);
            },
            child: Text(
              'Time: ${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')} UTC',
            ),
          ),
          Wrap(
            spacing: 4,
            children: List.generate(
              7,
              (i) => FilterChip(
                label: Text(
                  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
                ),
                selected: days.contains(i),
                onSelected: (v) => setState(() {
                  if (v) {
                    days.add(i);
                  } else if (days.length > 1) {
                    days.remove(i);
                  }
                }),
              ),
            ),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: () => Navigator.pop(context, {
          'enabled': enabled,
          'timeUtc':
              '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}',
          'days': days.toList()..sort(),
        }),
        child: const Text('Save'),
      ),
    ],
  );
}
