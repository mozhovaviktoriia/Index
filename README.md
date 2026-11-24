# Тайный Санта

Файлы в корне проекта — production-версия. Папка `debug/` содержит отдельную копию для тестов и помечена DEBUG-баннером.

## Запуск debug-копии

1. Создай отдельную тестовую базу MySQL на хостинге.
2. Заполни `debug/config.php` данными тестовой базы и отдельным паролем организатора. Не используй production-базу.
3. Загрузи содержимое папки `debug/` в каталог `/debug` на хостинге.
4. Открой сайт по адресу `/debug/`, создай тестовых участников и проведи жеребьёвку.

При загрузке из Git создай `debug/config.php` на основе `debug/config.example.php`. Таблицы создаются API автоматически при первом запросе.

## Telegram group notifications in debug

The debug site sends short-lived, HMAC-signed notification tickets from the participant's browser to the Cloudflare Worker's `/notify` endpoint. The Worker sends only generic notifications to the Telegram group; chat contents and pair assignments are never included. No incoming Telegram webhook or personal Telegram binding is used.

1. Keep `TELEGRAM_BOT_TOKEN` only in the Worker's encrypted Secrets. Do not put it in PHP, JavaScript, or the repository.
2. Set the Worker's `TELEGRAM_RELAY_SECRET` secret to the same value configured locally in `debug/config.php`. Set `ALLOWED_ORIGIN` to `https://tajnyj-santa.lovestoblog.com`.
3. Delete the old Telegram webhook before using `getUpdates` to obtain the group chat ID. Do not register a webhook to the InfinityFree PHP endpoint.
4. In the private `debug/config.php`, set `TELEGRAM_GROUP_CHAT_ID` and `TELEGRAM_RELAY_SECRET`. Never commit this file or share its values.
5. In the debug organizer panel, save the Worker's base HTTPS URL. This only stores the URL for `/notify`; it does not call `/setup` or register a webhook.
6. Add participant Telegram usernames in the organizer panel. Notifications go to the common group after a chat message, organizer notice, or draw. Missing usernames fall back to participant names and are flagged in the organizer panel.
