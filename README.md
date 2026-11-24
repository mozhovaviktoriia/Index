# Тайный Санта

Файлы в корне проекта — production-версия. Папка `debug/` содержит отдельную копию для тестов и помечена DEBUG-баннером.

## Запуск debug-копии

1. Создай отдельную тестовую базу MySQL на хостинге.
2. Заполни `debug/config.php` данными тестовой базы и отдельным паролем организатора. Не используй production-базу.
3. Загрузи содержимое папки `debug/` в каталог `/debug` на хостинге.
4. Открой сайт по адресу `/debug/`, создай тестовых участников и проведи жеребьёвку.

При загрузке из Git создай `debug/config.php` на основе `debug/config.example.php`. Таблицы создаются API автоматически при первом запросе.

## Telegram notifications in debug

The debug site uses a Cloudflare Worker as a relay because some shared hosts cannot make outbound requests to Telegram.

1. In Cloudflare, create a Worker and paste `debug/telegram-worker.js` into its editor, then deploy it.
2. In Worker settings, add these secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_RELAY_SECRET`, and `WORKER_ADMIN_SECRET`. Use a new random value for the last two; keep the relay secret for the next step.
3. Add these plain-text variables: `ALLOWED_ORIGIN=https://tajnyj-santa.lovestoblog.com` and `TELEGRAM_WEBHOOK_URL=https://tajnyj-santa.lovestoblog.com/debug/telegram_bot.php`.
4. In the hosting file manager, add `const TELEGRAM_RELAY_SECRET = 'same relay secret';` to `htdocs/debug/config.php`.
5. In the debug organizer panel, enter the deployed Worker base URL and `WORKER_ADMIN_SECRET`, then connect Telegram.
6. Participants link Telegram from their pair chat. New chat messages are sent to the recipient through the Worker.
