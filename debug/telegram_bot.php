<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
require __DIR__.'/config.php';

function telegram_webhook_response(?string $chatId = null, ?string $text = null): void
{
    if ($chatId !== null && $text !== null) {
        echo json_encode([
            'method' => 'sendMessage',
            'chat_id' => $chatId,
            'text' => $text,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } else {
        echo json_encode(['ok' => true]);
    }
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false]);
    exit;
}

$secret = defined('TELEGRAM_WEBHOOK_SECRET') ? (string)constant('TELEGRAM_WEBHOOK_SECRET') : '';
$provided = (string)($_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '');
if ($secret === '' || !hash_equals($secret, $provided)) {
    http_response_code(403);
    echo json_encode(['ok' => false]);
    exit;
}

$update = json_decode((string)file_get_contents('php://input'), true);
$message = is_array($update) ? ($update['message'] ?? null) : null;
if (!is_array($message)) {
    echo json_encode(['ok' => true]);
    exit;
}
$chatId = (string)($message['chat']['id'] ?? '');
$text = (string)($message['text'] ?? '');
$username = isset($message['from']['username']) ? (string)$message['from']['username'] : null;
if ($chatId === '' || !preg_match('/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(.+))?$/u', trim($text), $matches)) {
    telegram_webhook_response();
}
$bindToken = trim((string)($matches[1] ?? ''));
if ($bindToken === '') {
    telegram_webhook_response($chatId, 'Не вижу кода подключения. Снова нажмите «Подключить Telegram» на сайте и отправьте боту команду целиком.');
}

$linked = false;
try {
    $pdo = new PDO(
        'mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    $pdo->beginTransaction();
    $st = $pdo->prepare('SELECT participant_id FROM telegram_bind_tokens
        WHERE token_hash = ? AND expires_at >= UTC_TIMESTAMP()
        FOR UPDATE');
    $st->execute([hash('sha256', $bindToken)]);
    $participantId = $st->fetchColumn();
    if ($participantId !== false) {
        $participantId = (int)$participantId;
        $pdo->prepare('DELETE FROM telegram_bindings WHERE chat_id = ?')->execute([$chatId]);
        $pdo->prepare('REPLACE INTO telegram_bindings (participant_id, chat_id, username)
            VALUES (?, ?, ?)')->execute([$participantId, $chatId, $username]);
        $pdo->prepare('DELETE FROM telegram_bind_tokens WHERE participant_id = ?')->execute([$participantId]);
        $pdo->commit();
        $linked = true;
    } else {
        $pdo->commit();
    }
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['ok' => false]);
    exit;
}

telegram_webhook_response(
    $chatId,
    $linked
        ? '✅ Telegram подключён. Вернитесь на сайт — статус обновится.'
        : 'Код не найден или срок его действия истёк. На сайте нажмите «Подключить Telegram» и отправьте новую команду целиком.'
);
