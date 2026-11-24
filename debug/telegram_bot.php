<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
require __DIR__.'/config.php';

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
if ($chatId === '' || !preg_match('/^\/start(?:\s+(.+))?$/u', trim($text), $matches)) {
    echo json_encode(['ok' => true]);
    exit;
}
$bindToken = trim((string)($matches[1] ?? ''));
$token = defined('TELEGRAM_BOT_TOKEN') ? (string)constant('TELEGRAM_BOT_TOKEN') : '';
if ($bindToken === '' || $token === '') {
    echo json_encode(['ok' => true]);
    exit;
}

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

        $ch = curl_init('https://api.telegram.org/bot'.$token.'/sendMessage');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode([
                'chat_id' => $chatId,
                'text' => 'Готово! Теперь сюда придут уведомления о новых сообщениях в Тайном Санте.',
            ], JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
        ]);
        curl_exec($ch);
        curl_close($ch);
    } else {
        $pdo->commit();
    }
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
}

echo json_encode(['ok' => true]);
