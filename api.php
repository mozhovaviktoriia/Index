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

function is_drawn(PDO $pdo): bool
{
    return ((int)$pdo->query('SELECT COUNT(*) FROM pairs')->fetchColumn()) > 0;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
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

    $pdo->exec('CREATE TABLE IF NOT EXISTS throttle (
        k VARCHAR(100) NOT NULL PRIMARY KEY,
        n INT NOT NULL DEFAULT 0,
        t INT NOT NULL DEFAULT 0
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');

    switch ($action) {
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
            if ($row) {
                if (!check_pin($pdo, $name, $pin, (string)$row['pin_hash'])) {
                    fail('Это имя уже занято. Если это ты и хочешь изменить анкету, введи то же секретное слово.', 403);
                }
                $pdo->prepare('UPDATE participants SET data = ? WHERE id = ?')->execute([$json, $row['id']]);
                out(['ok' => true, 'updated' => true]);
            }

            if (is_drawn($pdo)) {
                fail('Жеребьёвка уже проведена, новых участников добавить нельзя. Напиши организатору.', 409);
            }
            $pdo->prepare('INSERT INTO participants (name, pin_hash, data) VALUES (?, ?, ?)')
                ->execute([$name, password_hash($pin, PASSWORD_DEFAULT), $json]);
            out(['ok' => true, 'updated' => false]);
            break;

        case 'reveal':
            $name = clean_name((string)($in['name'] ?? ''));
            $pin = clean_pin((string)($in['pin'] ?? ''));
            if ($name === '' || $pin === '') {
                fail('Введи имя и секретное слово');
            }
            $st = $pdo->prepare('SELECT id, pin_hash FROM participants WHERE name = ?');
            $st->execute([$name]);
            $row = $st->fetch();
            if (!$row) {
                fail('Такого имени нет в списке. Проверь, как оно написано в анкете.', 404);
            }
            if (!check_pin($pdo, $name, $pin, (string)$row['pin_hash'])) {
                fail('Секретное слово не подходит', 403);
            }
            $st = $pdo->prepare('SELECT t.name AS name, t.data AS data FROM pairs p JOIN participants t ON t.id = p.target_id WHERE p.giver_id = ?');
            $st->execute([$row['id']]);
            $r = $st->fetch();
            if (!$r) {
                out(['ok' => true, 'status' => 'waiting']);
            }
            $decoded = json_decode((string)$r['data'], true);
            out([
                'ok' => true,
                'status' => 'ready',
                'target' => ['name' => $r['name'], 'data' => is_array($decoded) ? $decoded : new stdClass()],
            ]);
            break;

        case 'admin_list':
            require_admin($pdo, $in);
            $rows = $pdo->query('SELECT id, name FROM participants ORDER BY id')->fetchAll();
            out(['ok' => true, 'participants' => $rows, 'drawn' => is_drawn($pdo)]);
            break;

        case 'admin_delete':
            require_admin($pdo, $in);
            $id = (int)($in['id'] ?? 0);
            $pdo->beginTransaction();
            $pdo->exec('DELETE FROM pairs');
            $pdo->prepare('DELETE FROM participants WHERE id = ?')->execute([$id]);
            $pdo->commit();
            out(['ok' => true]);
            break;

        case 'admin_draw':
            require_admin($pdo, $in);
            $ids = $pdo->query('SELECT id FROM participants')->fetchAll(PDO::FETCH_COLUMN);
            $n = count($ids);
            if ($n < 3) {
                fail('Нужно минимум три участника');
            }
            for ($i = $n - 1; $i > 0; $i--) {
                $j = random_int(0, $i);
                $tmp = $ids[$i];
                $ids[$i] = $ids[$j];
                $ids[$j] = $tmp;
            }
            $pdo->beginTransaction();
            $pdo->exec('DELETE FROM pairs');
            $ins = $pdo->prepare('INSERT INTO pairs (giver_id, target_id) VALUES (?, ?)');
            for ($i = 0; $i < $n; $i++) {
                $ins->execute([$ids[$i], $ids[($i + 1) % $n]]);
            }
            $pdo->commit();
            out(['ok' => true, 'count' => $n]);
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