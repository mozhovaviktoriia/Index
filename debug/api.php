<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require __DIR__ . '/config.php';

function out(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $message, int $code = 400): void
{
    out(['ok' => false, 'error' => $message], $code);
}

function str_len(string $s): int
{
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s);
}

function str_lower(string $s): string
{
    return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
}

function clean_name(string $s): string
{
    $s = preg_replace('/\s+/u', ' ', $s);
    return trim($s === null ? '' : $s);
}

function clean_pin(string $s): string
{
    return str_lower(trim($s));
}

function throttle_check(PDO $pdo, string $key): void
{
    $st = $pdo->prepare('SELECT n, t FROM throttle WHERE k = ?');
    $st->execute([$key]);
    $r = $st->fetch();
    if ($r && (int)$r['n'] >= 6 && time() - (int)$r['t'] < 600) {
        fail('Слишком много неверных попыток. Подожди 10 минут и попробуй снова.', 429);
    }
}

function throttle_fail(PDO $pdo, string $key): void
{
    $now = time();
    $st = $pdo->prepare('SELECT n, t FROM throttle WHERE k = ?');
    $st->execute([$key]);
    $r = $st->fetch();
    $n = ($r && $now - (int)$r['t'] < 600) ? (int)$r['n'] + 1 : 1;
    $pdo->prepare('REPLACE INTO throttle (k, n, t) VALUES (?, ?, ?)')->execute([$key, $n, $now]);
}

function throttle_clear(PDO $pdo, string $key): void
{
    $pdo->prepare('DELETE FROM throttle WHERE k = ?')->execute([$key]);
}

function require_admin(PDO $pdo, array $in): void
{
    throttle_check($pdo, 'admin');
    $pw = (string)($in['password'] ?? '');
    $orgPassword = defined('ORG_PASSWORD') ? (string)constant('ORG_PASSWORD') : '';
    if ($orgPassword === '' || !hash_equals($orgPassword, $pw)) {
        throttle_fail($pdo, 'admin');
        fail('Неверный пароль организатора', 403);
    }
    throttle_clear($pdo, 'admin');
}

function check_pin(PDO $pdo, string $name, string $pin, string $hash): bool
{
    $key = 'pin:' . str_lower($name);
    throttle_check($pdo, $key);
    if (!password_verify($pin, $hash)) {
        throttle_fail($pdo, $key);
        return false;
    }
    throttle_clear($pdo, $key);
    return true;
}

function require_participant(PDO $pdo, array $in): array
{
    $name = clean_name((string)($in['name'] ?? ''));
    $pin = clean_pin((string)($in['pin'] ?? ''));
    if ($name === '' || $pin === '') {
        fail('Введи имя и секретное слово');
    }
    $st = $pdo->prepare('SELECT id, pin_hash FROM participants WHERE name = ?');
    $st->execute([$name]);
    $participant = $st->fetch();
    if (!$participant) {
        fail('Такого имени нет в списке. Проверь, как оно написано в анкете.', 404);
    }
    if (!check_pin($pdo, $name, $pin, (string)$participant['pin_hash'])) {
        fail('Секретное слово не подходит', 403);
    }
    return $participant;
}

function claim_pending_organizer_notice(PDO $pdo, int $participantId): ?array
{
    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('SELECT id, message FROM organizer_notices
            WHERE recipient_id = ? AND delivered_at IS NULL AND acknowledged_at IS NULL
            ORDER BY id
            LIMIT 1
            FOR UPDATE');
        $st->execute([$participantId]);
        $notice = $st->fetch();
        if (!$notice) {
            $pdo->commit();
            return null;
        }
        $pdo->prepare('UPDATE organizer_notices SET delivered_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$notice['id']]);
        $pdo->commit();
        return ['id' => (int)$notice['id'], 'message' => (string)$notice['message']];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function pending_organizer_notices(PDO $pdo): array
{
    return $pdo->query('SELECT n.id, p.name AS recipient_name, n.message
        FROM organizer_notices n
        JOIN participants p ON p.id = n.recipient_id
        WHERE n.delivered_at IS NULL AND n.acknowledged_at IS NULL
        ORDER BY n.id')->fetchAll();
}

function require_chat_pair(PDO $pdo, int $participantId, string $direction): array
{
    if ($direction === 'giver') {
        $st = $pdo->prepare('SELECT giver_id, target_id FROM pairs WHERE giver_id = ?');
    } elseif ($direction === 'recipient') {
        $st = $pdo->prepare('SELECT giver_id, target_id FROM pairs WHERE target_id = ?');
    } else {
        fail('Не удалось определить собеседника чата');
    }
    $st->execute([$participantId]);
    $pair = $st->fetch();
    if (!$pair) {
        fail('Не удалось найти твою пару. Возможно, жеребьёвка была сброшена.', 409);
    }
    return $pair;
}

function chat_messages(PDO $pdo, array $pair, int $participantId): array
{
    $st = $pdo->prepare('SELECT id, sender_id, message,
            UNIX_TIMESTAMP(COALESCE(updated_at, created_at)) AS sent_at,
            updated_at IS NOT NULL AS edited
        FROM chat_messages
        WHERE giver_id = ? AND target_id = ?
        ORDER BY id DESC
        LIMIT 100');
    $st->execute([$pair['giver_id'], $pair['target_id']]);
    $kyiv = new DateTimeZone('Europe/Kyiv');
    return array_map(static function (array $message) use ($participantId, $kyiv): array {
        $fromYou = (int)$message['sender_id'] === $participantId;
        $sentAt = (new DateTimeImmutable('@' . (int)$message['sent_at']))
            ->setTimezone($kyiv)
            ->format('d.m, H:i');
        return [
            'id' => $fromYou ? (int)$message['id'] : null,
            'fromYou' => $fromYou,
            'text' => $message['message'],
            'sentAt' => $sentAt,
            'edited' => (bool)$message['edited'],
        ];
    }, array_reverse($st->fetchAll()));
}

function create_telegram_notification(PDO $pdo, int $recipientId, bool $fromSanta): ?array
{
    $relaySecret = defined('TELEGRAM_RELAY_SECRET') ? (string)constant('TELEGRAM_RELAY_SECRET') : '';
    if ($relaySecret === '') return null;

    $setting = $pdo->prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?');
    $setting->execute(['telegram_worker_url']);
    $workerUrl = rtrim((string)$setting->fetchColumn(), '/');
    if ($workerUrl === '') return null;

    $st = $pdo->prepare('SELECT chat_id FROM telegram_bindings WHERE participant_id = ?');
    $st->execute([$recipientId]);
    $chatId = $st->fetchColumn();
    if ($chatId === false) return null;

    $text = $fromSanta
        ? '🎁 Вам написал Тайный Санта. Откройте чат на сайте Тайного Санты.'
        : '🎁 Вам написал ваш получатель. Откройте чат на сайте Тайного Санты.';
    $ticket = json_encode([
        'chat_id' => (string)$chatId,
        'text' => $text,
        'expires_at' => time() + 300,
        'nonce' => bin2hex(random_bytes(16)),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($ticket)) {
        throw new RuntimeException('Не удалось создать билет Telegram-уведомления');
    }

    $encodedTicket = rtrim(strtr(base64_encode($ticket), '+/', '-_'), '=');
    return [
        'worker_url' => $workerUrl,
        'ticket' => $encodedTicket,
        'signature' => hash_hmac('sha256', $encodedTicket, $relaySecret),
    ];
}

function is_drawn(PDO $pdo): bool
{
    $st = $pdo->prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?');
    $st->execute(['checklist_locked']);
    return $st->fetchColumn() === '1'
        || ((int)$pdo->query('SELECT COUNT(*) FROM pairs')->fetchColumn()) > 0;
}

function lock_checklist_state(PDO $pdo): bool
{
    $st = $pdo->prepare('SELECT setting_value FROM app_settings WHERE setting_key = ? FOR UPDATE');
    $st->execute(['checklist_locked']);
    $locked = $st->fetchColumn() === '1';
    $hasPairs = ((int)$pdo->query('SELECT COUNT(*) FROM pairs')->fetchColumn()) > 0;
    if ($hasPairs && !$locked) {
        $pdo->prepare('UPDATE app_settings SET setting_value = ? WHERE setting_key = ?')
            ->execute(['1', 'checklist_locked']);
    }
    return $locked || $hasPairs;
}

function get_deadline(PDO $pdo): ?string
{
    $st = $pdo->prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?');
    $st->execute(['checklist_deadline_utc']);
    $value = $st->fetchColumn();
    if ($value === false) {
        return null;
    }
    $deadline = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', (string)$value, new DateTimeZone('UTC'));
    if ($deadline === false) {
        throw new RuntimeException('Invalid saved checklist deadline');
    }
    return $deadline->format('Y-m-d\TH:i:s\Z');
}

function get_timer_mode(PDO $pdo): string
{
    $st = $pdo->prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?');
    $st->execute(['timer_mode']);
    $value = $st->fetchColumn();
    return $value === 'gift' ? 'gift' : 'draw';
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Проверка сайта</title><body><main><h1>Проверка сайта</h1><p>Если хостинг показывал проверку, завершите её. Затем вернитесь на страницу Тайного Санты и повторите вход.</p></main></body></html>';
        exit;
    }
    fail('Только POST-запросы', 405);
}

if (DB_PASS === 'PUT_DB_PASSWORD_HERE' || ORG_PASSWORD === 'CHOOSE_ORGANIZER_PASSWORD') {
    fail('Сервер не настроен: заполни файл config.php', 500);
}

$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) > 60000) {
    fail('Слишком большой запрос', 413);
}
$in = json_decode($raw, true);
if (!is_array($in)) {
    fail('Некорректный запрос');
}
$action = (string)($in['action'] ?? '');

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
} catch (Throwable $e) {
    fail('Не удалось подключиться к базе данных. Проверь данные в config.php', 500);
}

try {
    $pdo->exec('CREATE TABLE IF NOT EXISTS participants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(60) NOT NULL,
        pin_hash VARCHAR(255) NOT NULL,
        data MEDIUMTEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_name (name)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');

    $pdo->exec('CREATE TABLE IF NOT EXISTS pairs (
        giver_id INT NOT NULL PRIMARY KEY,
        target_id INT NOT NULL
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');

    $pdo->exec('CREATE TABLE IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        giver_id INT NOT NULL,
        target_id INT NOT NULL,
        sender_id INT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(6) NULL DEFAULT NULL,
        KEY ix_chat_pair (giver_id, target_id, id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    if (!$pdo->query("SHOW COLUMNS FROM chat_messages LIKE 'updated_at'")->fetch()) {
        $pdo->exec('ALTER TABLE chat_messages ADD updated_at TIMESTAMP(6) NULL DEFAULT NULL');
    }

    $pdo->exec('CREATE TABLE IF NOT EXISTS telegram_bindings (
        participant_id INT NOT NULL PRIMARY KEY,
        chat_id VARCHAR(64) NOT NULL,
        username VARCHAR(64) NULL DEFAULT NULL,
        linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_telegram_chat (chat_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');

    $pdo->exec('CREATE TABLE IF NOT EXISTS telegram_bind_tokens (
        participant_id INT NOT NULL PRIMARY KEY,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');

    $pdo->exec('CREATE TABLE IF NOT EXISTS throttle (
        k VARCHAR(100) NOT NULL PRIMARY KEY,
        n INT NOT NULL DEFAULT 0,
        t INT NOT NULL DEFAULT 0
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');

    $pdo->exec('CREATE TABLE IF NOT EXISTS app_settings (
        setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
        setting_value VARCHAR(255) NOT NULL
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo->prepare('INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)')
        ->execute(['checklist_locked', '0']);

    $pdo->exec('CREATE TABLE IF NOT EXISTS organizer_notices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        recipient_id INT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        delivered_at TIMESTAMP NULL DEFAULT NULL,
        acknowledged_at TIMESTAMP NULL DEFAULT NULL,
        KEY ix_notice_recipient_pending (recipient_id, acknowledged_at, id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    if (!$pdo->query("SHOW COLUMNS FROM organizer_notices LIKE 'delivered_at'")->fetch()) {
        $pdo->exec('ALTER TABLE organizer_notices ADD delivered_at TIMESTAMP NULL DEFAULT NULL');
    }

    switch ($action) {
        case 'event_info':
            out(['ok' => true, 'deadline' => get_deadline($pdo), 'drawn' => is_drawn($pdo), 'timer_mode' => get_timer_mode($pdo)]);
            break;

        case 'status':
            $names = $pdo->query('SELECT name FROM participants ORDER BY name')->fetchAll(PDO::FETCH_COLUMN);
            out(['ok' => true, 'names' => $names, 'drawn' => is_drawn($pdo)]);
            break;

        case 'register':
            $name = clean_name((string)($in['name'] ?? ''));
            $pin = clean_pin((string)($in['pin'] ?? ''));
            $data = $in['data'] ?? null;
            if ($name === '' || str_len($name) > 40) {
                fail('Имя должно быть от 1 до 40 символов');
            }
            if (str_len($pin) < 3 || str_len($pin) > 40) {
                fail('Секретное слово должно быть от 3 до 40 символов');
            }
            if (!is_array($data)) {
                fail('Нет данных анкеты');
            }
            $json = json_encode($data, JSON_UNESCAPED_UNICODE);
            if ($json === false || strlen($json) > 40000) {
                fail('Анкета слишком большая');
            }

            $st = $pdo->prepare('SELECT id, pin_hash FROM participants WHERE name = ?');
            $st->execute([$name]);
            $row = $st->fetch();
            if ($row && !check_pin($pdo, $name, $pin, (string)$row['pin_hash'])) {
                fail('Это имя уже занято. Если это ты и хочешь изменить анкету, введи то же секретное слово.', 403);
            }

            $pdo->beginTransaction();
            if (lock_checklist_state($pdo)) {
                $pdo->rollBack();
                fail('Жеребьёвка уже началась, чек-листы больше нельзя создавать или изменять.', 409);
            }
            if ($row) {
                $check = $pdo->prepare('SELECT id FROM participants WHERE id = ?');
                $check->execute([$row['id']]);
                if (!$check->fetch()) {
                    $pdo->rollBack();
                    fail('Участник больше не найден. Обнови страницу и попробуй снова.', 404);
                }
                $pdo->prepare('UPDATE participants SET data = ? WHERE id = ?')->execute([$json, $row['id']]);
                $pdo->commit();
                out(['ok' => true, 'updated' => true]);
            }
            $pdo->prepare('INSERT INTO participants (name, pin_hash, data) VALUES (?, ?, ?)')
                ->execute([$name, password_hash($pin, PASSWORD_DEFAULT), $json]);
            $pdo->commit();
            out(['ok' => true, 'updated' => false]);
            break;

        case 'edit_load':
            $name = clean_name((string)($in['name'] ?? ''));
            $pin = clean_pin((string)($in['pin'] ?? ''));
            if ($name === '' || $pin === '') {
                fail('Введи имя и секретное слово');
            }
            $st = $pdo->prepare('SELECT id, pin_hash, data FROM participants WHERE name = ?');
            $st->execute([$name]);
            $row = $st->fetch();
            if (!$row) {
                fail('Такого имени нет в списке. Проверь, как оно написано в анкете.', 404);
            }
            if (!check_pin($pdo, $name, $pin, (string)$row['pin_hash'])) {
                fail('Секретное слово не подходит', 403);
            }
            if (is_drawn($pdo)) {
                fail('Жеребьёвка уже началась, редактирование чек-листов закрыто.', 409);
            }
            $decoded = json_decode((string)$row['data'], true);
            out(['ok' => true, 'data' => is_array($decoded) ? $decoded : new stdClass()]);
            break;

        case 'reveal':
            $participant = require_participant($pdo, $in);
            $notice = claim_pending_organizer_notice($pdo, (int)$participant['id']);
            $st = $pdo->prepare('SELECT t.name AS name, t.data AS data FROM pairs p JOIN participants t ON t.id = p.target_id WHERE p.giver_id = ?');
            $st->execute([$participant['id']]);
            $r = $st->fetch();
            if (!$r) {
                out(['ok' => true, 'status' => 'waiting', 'notice' => $notice]);
            }
            $decoded = json_decode((string)$r['data'], true);
            out([
                'ok' => true,
                'status' => 'ready',
                'target' => ['name' => $r['name'], 'data' => is_array($decoded) ? $decoded : new stdClass()],
                'notice' => $notice,
            ]);
            break;

        case 'notice_ack':
            $participant = require_participant($pdo, $in);
            $id = (int)($in['id'] ?? 0);
            if ($id < 1) {
                fail('Не удалось определить сообщение');
            }
            $st = $pdo->prepare('SELECT id FROM organizer_notices WHERE id = ? AND recipient_id = ?');
            $st->execute([$id, $participant['id']]);
            if (!$st->fetch()) {
                fail('Сообщение не найдено', 404);
            }
            $pdo->prepare('UPDATE organizer_notices
                SET acknowledged_at = COALESCE(acknowledged_at, CURRENT_TIMESTAMP)
                WHERE id = ? AND recipient_id = ?')
                ->execute([$id, $participant['id']]);
            out(['ok' => true, 'notice' => claim_pending_organizer_notice($pdo, (int)$participant['id'])]);
            break;

        case 'telegram_status':
            $participant = require_participant($pdo, $in);
            $st = $pdo->prepare('SELECT chat_id, username, linked_at FROM telegram_bindings WHERE participant_id = ?');
            $st->execute([(int)$participant['id']]);
            $binding = $st->fetch();
            out(['ok' => true, 'linked' => (bool)$binding, 'username' => $binding ? (string)$binding['username'] : null]);
            break;

        case 'telegram_bind_start':
            $participant = require_participant($pdo, $in);
            $username = defined('TELEGRAM_BOT_USERNAME') ? trim((string)constant('TELEGRAM_BOT_USERNAME'), '@') : '';
            if ($username === '') {
                fail('Telegram-бот ещё не настроен на сервере.', 503);
            }
            $bindToken = bin2hex(random_bytes(24));
            $pdo->prepare('REPLACE INTO telegram_bind_tokens (participant_id, token_hash, expires_at)
                VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))')
                ->execute([(int)$participant['id'], hash('sha256', $bindToken)]);
            out(['ok' => true, 'link' => 'https://t.me/'.$username.'?start='.$bindToken]);
            break;

        case 'telegram_unlink':
            $participant = require_participant($pdo, $in);
            $pdo->prepare('DELETE FROM telegram_bindings WHERE participant_id = ?')
                ->execute([(int)$participant['id']]);
            $pdo->prepare('DELETE FROM telegram_bind_tokens WHERE participant_id = ?')
                ->execute([(int)$participant['id']]);
            out(['ok' => true, 'linked' => false]);
            break;

        case 'chat_load':
            $participant = require_participant($pdo, $in);
            if (!is_drawn($pdo)) {
                fail('Чат станет доступен после жеребьёвки.', 409);
            }
            $direction = (string)($in['direction'] ?? 'giver');
            $pair = require_chat_pair($pdo, (int)$participant['id'], $direction);
            out([
                'ok' => true,
                'role' => $direction,
                'direction' => $direction,
                'messages' => chat_messages($pdo, $pair, (int)$participant['id']),
            ]);
            break;

        case 'chat_send':
            $participant = require_participant($pdo, $in);
            if (!is_drawn($pdo)) {
                fail('Чат станет доступен после жеребьёвки.', 409);
            }
            $message = trim((string)($in['message'] ?? ''));
            if ($message === '' || str_len($message) > 1000) {
                fail('Сообщение должно содержать от 1 до 1000 символов');
            }
            $direction = (string)($in['direction'] ?? 'giver');
            $pair = require_chat_pair($pdo, (int)$participant['id'], $direction);
            $pdo->prepare('INSERT INTO chat_messages (giver_id, target_id, sender_id, message) VALUES (?, ?, ?, ?)')
                ->execute([$pair['giver_id'], $pair['target_id'], $participant['id'], $message]);
            $recipientId = (int)$participant['id'] === (int)$pair['giver_id']
                ? (int)$pair['target_id']
                : (int)$pair['giver_id'];
            $notification = create_telegram_notification(
                $pdo,
                $recipientId,
                (int)$participant['id'] === (int)$pair['giver_id']
            );
            out([
                'ok' => true,
                'role' => $direction,
                'direction' => $direction,
                'messages' => chat_messages($pdo, $pair, (int)$participant['id']),
                'notification' => $notification,
            ]);
            break;

        case 'chat_edit':
            $participant = require_participant($pdo, $in);
            if (!is_drawn($pdo)) {
                fail('Чат станет доступен после жеребьёвки.', 409);
            }
            $id = (int)($in['id'] ?? 0);
            $message = trim((string)($in['message'] ?? ''));
            if ($id < 1) {
                fail('Не удалось найти сообщение');
            }
            if ($message === '' || str_len($message) > 1000) {
                fail('Сообщение должно содержать от 1 до 1000 символов');
            }
            $direction = (string)($in['direction'] ?? 'giver');
            $pair = require_chat_pair($pdo, (int)$participant['id'], $direction);
            $st = $pdo->prepare('UPDATE chat_messages
                SET message = ?, updated_at = CURRENT_TIMESTAMP(6)
                WHERE id = ? AND giver_id = ? AND target_id = ? AND sender_id = ?');
            $st->execute([$message, $id, $pair['giver_id'], $pair['target_id'], $participant['id']]);
            if ($st->rowCount() !== 1) {
                fail('Сообщение не найдено или его нельзя изменить.', 404);
            }
            out([
                'ok' => true,
                'role' => $direction,
                'direction' => $direction,
                'messages' => chat_messages($pdo, $pair, (int)$participant['id']),
            ]);
            break;

        case 'chat_delete':
            $participant = require_participant($pdo, $in);
            if (!is_drawn($pdo)) {
                fail('Чат станет доступен после жеребьёвки.', 409);
            }
            $id = (int)($in['id'] ?? 0);
            if ($id < 1) {
                fail('Не удалось найти сообщение');
            }
            $direction = (string)($in['direction'] ?? 'giver');
            $pair = require_chat_pair($pdo, (int)$participant['id'], $direction);
            $st = $pdo->prepare('DELETE FROM chat_messages
                WHERE id = ? AND giver_id = ? AND target_id = ? AND sender_id = ?');
            $st->execute([$id, $pair['giver_id'], $pair['target_id'], $participant['id']]);
            if ($st->rowCount() !== 1) {
                fail('Сообщение не найдено или его нельзя удалить.', 404);
            }
            out([
                'ok' => true,
                'role' => $direction,
                'direction' => $direction,
                'messages' => chat_messages($pdo, $pair, (int)$participant['id']),
            ]);
            break;

        case 'admin_list':
            require_admin($pdo, $in);
            $rows = $pdo->query('SELECT id, name FROM participants ORDER BY id')->fetchAll();
            out([
                'ok' => true,
                'participants' => $rows,
                'notices' => pending_organizer_notices($pdo),
                'drawn' => is_drawn($pdo),
                'deadline' => get_deadline($pdo),
                'timer_mode' => get_timer_mode($pdo),
            ]);
            break;

        case 'admin_send_notice':
            require_admin($pdo, $in);
            $recipientId = (int)($in['recipient_id'] ?? 0);
            $message = trim((string)($in['message'] ?? ''));
            if ($recipientId < 1) {
                fail('Выбери участника');
            }
            if ($message === '' || str_len($message) > 2000) {
                fail('Текст сообщения должен быть от 1 до 2000 символов');
            }
            $st = $pdo->prepare('SELECT name FROM participants WHERE id = ?');
            $st->execute([$recipientId]);
            $recipientName = $st->fetchColumn();
            if ($recipientName === false) {
                fail('Участник не найден. Обнови список и попробуй снова.', 404);
            }
            $pdo->prepare('INSERT INTO organizer_notices (recipient_id, message) VALUES (?, ?)')
                ->execute([$recipientId, $message]);
            out(['ok' => true, 'recipient_name' => (string)$recipientName]);
            break;

        case 'admin_notice_edit':
            require_admin($pdo, $in);
            $id = (int)($in['id'] ?? 0);
            $message = trim((string)($in['message'] ?? ''));
            if ($id < 1) {
                fail('Не удалось определить письмо');
            }
            if ($message === '' || str_len($message) > 2000) {
                fail('Текст письма должен быть от 1 до 2000 символов');
            }
            $pdo->beginTransaction();
            $st = $pdo->prepare('SELECT delivered_at, acknowledged_at FROM organizer_notices WHERE id = ? FOR UPDATE');
            $st->execute([$id]);
            $notice = $st->fetch();
            if (!$notice || $notice['delivered_at'] !== null || $notice['acknowledged_at'] !== null) {
                $pdo->rollBack();
                fail('Письмо уже показано адресату или не найдено; изменить его нельзя.', 409);
            }
            $pdo->prepare('UPDATE organizer_notices SET message = ? WHERE id = ?')->execute([$message, $id]);
            $pdo->commit();
            out(['ok' => true]);
            break;

        case 'admin_notice_cancel':
            require_admin($pdo, $in);
            $id = (int)($in['id'] ?? 0);
            if ($id < 1) {
                fail('Не удалось определить письмо');
            }
            $pdo->beginTransaction();
            $st = $pdo->prepare('SELECT delivered_at, acknowledged_at FROM organizer_notices WHERE id = ? FOR UPDATE');
            $st->execute([$id]);
            $notice = $st->fetch();
            if (!$notice || $notice['delivered_at'] !== null || $notice['acknowledged_at'] !== null) {
                $pdo->rollBack();
                fail('Письмо уже показано адресату или не найдено; отменить его нельзя.', 409);
            }
            $pdo->prepare('DELETE FROM organizer_notices WHERE id = ?')->execute([$id]);
            $pdo->commit();
            out(['ok' => true]);
            break;

        case 'admin_set_deadline':
            require_admin($pdo, $in);
            $value = trim((string)($in['deadline'] ?? ''));
            if ($value === '') {
                $pdo->prepare('DELETE FROM app_settings WHERE setting_key = ?')->execute(['checklist_deadline_utc']);
                out(['ok' => true, 'deadline' => null]);
            }
            $local = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $value, new DateTimeZone('Europe/Kyiv'));
            $errors = DateTimeImmutable::getLastErrors();
            if (
                $local === false
                || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
                || $local->format('Y-m-d\TH:i') !== $value
            ) {
                fail('Укажи корректные дату и время по Киеву');
            }
            $deadlineUtc = $local->setTimezone(new DateTimeZone('UTC'));
            $pdo->prepare('REPLACE INTO app_settings (setting_key, setting_value) VALUES (?, ?)')
                ->execute(['checklist_deadline_utc', $deadlineUtc->format('Y-m-d H:i:s')]);
            out(['ok' => true, 'deadline' => $deadlineUtc->format('Y-m-d\TH:i:s\Z')]);
            break;

        case 'admin_set_timer_mode':
            require_admin($pdo, $in);
            $mode = trim((string)($in['mode'] ?? ''));
            if (!in_array($mode, ['draw', 'gift'], true)) {
                fail('Выбери корректный режим таймера');
            }
            $pdo->prepare('REPLACE INTO app_settings (setting_key, setting_value) VALUES (?, ?)')
                ->execute(['timer_mode', $mode]);
            out(['ok' => true, 'timer_mode' => $mode]);
            break;

        case 'admin_set_telegram_worker':
            require_admin($pdo, $in);
            $url = trim((string)($in['url'] ?? ''));
            $relaySecret = defined('TELEGRAM_RELAY_SECRET') ? (string)constant('TELEGRAM_RELAY_SECRET') : '';
            if ($relaySecret === '') {
                fail('Добавь TELEGRAM_RELAY_SECRET в debug/config.php.', 503);
            }
            $parts = parse_url($url);
            if (
                !is_array($parts)
                || strtolower((string)($parts['scheme'] ?? '')) !== 'https'
                || empty($parts['host'])
                || isset($parts['query'])
                || isset($parts['fragment'])
                || (isset($parts['path']) && !in_array($parts['path'], ['', '/'], true))
            ) {
                fail('Укажи базовый HTTPS-адрес Cloudflare Worker без пути.');
            }
            $workerUrl = rtrim($url, '/');
            $pdo->prepare('REPLACE INTO app_settings (setting_key, setting_value) VALUES (?, ?)')
                ->execute(['telegram_worker_url', $workerUrl]);
            out(['ok' => true, 'worker_url' => $workerUrl]);
            break;

        case 'admin_delete':
            require_admin($pdo, $in);
            $id = (int)($in['id'] ?? 0);
            $pdo->beginTransaction();
            lock_checklist_state($pdo);
            $pdo->exec('DELETE FROM chat_messages');
            $pdo->exec('DELETE FROM pairs');
            $pdo->prepare('DELETE FROM organizer_notices WHERE recipient_id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM participants WHERE id = ?')->execute([$id]);
            $pdo->commit();
            out(['ok' => true]);
            break;

        case 'admin_draw':
            require_admin($pdo, $in);
            $pdo->beginTransaction();
            lock_checklist_state($pdo);
            $ids = $pdo->query('SELECT id FROM participants')->fetchAll(PDO::FETCH_COLUMN);
            $n = count($ids);
            if ($n < 3) {
                $pdo->rollBack();
                fail('Нужно минимум три участника');
            }
            for ($i = $n - 1; $i > 0; $i--) {
                $j = random_int(0, $i);
                $tmp = $ids[$i];
                $ids[$i] = $ids[$j];
                $ids[$j] = $tmp;
            }
            $pdo->exec('DELETE FROM chat_messages');
            $pdo->exec('DELETE FROM pairs');
            $ins = $pdo->prepare('INSERT INTO pairs (giver_id, target_id) VALUES (?, ?)');
            for ($i = 0; $i < $n; $i++) {
                $ins->execute([$ids[$i], $ids[($i + 1) % $n]]);
            }
            $pdo->prepare('UPDATE app_settings SET setting_value = ? WHERE setting_key = ?')
                ->execute(['1', 'checklist_locked']);
            $pdo->commit();
            out(['ok' => true, 'count' => $n]);
            break;

        case 'admin_reset_draw':
            require_admin($pdo, $in);
            $pdo->beginTransaction();
            if (!lock_checklist_state($pdo)) {
                $pdo->rollBack();
                fail('Жеребьёвка ещё не проводилась.', 409);
            }
            $pdo->exec('DELETE FROM chat_messages');
            $pdo->exec('DELETE FROM pairs');
            $pdo->prepare('UPDATE app_settings SET setting_value = ? WHERE setting_key = ?')
                ->execute(['0', 'checklist_locked']);
            $pdo->commit();
            out(['ok' => true]);
            break;

        default:
            fail('Неизвестное действие');
    }
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ((string)$e->getCode() === '23000') {
        fail('Это имя уже занято', 409);
    }
    fail('Ошибка базы данных', 500);
} catch (Throwable $e) {
    fail('Ошибка сервера', 500);
}