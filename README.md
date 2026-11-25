# Тайный Санта

Файлы в корне проекта — production-версия. Папка `debug/` содержит отдельную копию для тестов и помечена DEBUG-баннером.

## Запуск debug-копии

1. Создай отдельную тестовую базу MySQL на хостинге.
2. Заполни `debug/config.php` данными тестовой базы и отдельным паролем организатора. Не используй production-базу.
3. Загрузи содержимое папки `debug/` в каталог `/debug` на хостинге.
4. Открой сайт по адресу `/debug/`, создай тестовых участников и проведи жеребьёвку.

При загрузке из Git создай `debug/config.php` на основе `debug/config.example.php`. Таблицы создаются API автоматически при первом запросе.

## Telegram group notifications

Both deployments send short-lived, HMAC-signed tickets from the browser to the Cloudflare Worker's `/notify` endpoint. Group notifications hide names and usernames by default; the organizer can enable them in the panel. Chat contents and pair assignments are never included. No incoming Telegram webhook or personal binding is used.

- Keep `TELEGRAM_BOT_TOKEN` only in the Worker's encrypted Secrets. Do not put it in PHP, JavaScript, or the repository.
- Set the Worker's `TELEGRAM_RELAY_SECRET` to the same value configured in the site's private `config.php`. For the debug copy, use `debug/config.php`. If production and debug use the same Worker, both configs must use the same relay secret.
- Set `ALLOWED_ORIGIN` to `https://tajnyj-santa.lovestoblog.com`. The production site and `/debug/` share this origin.
- Set `TELEGRAM_GROUP_CHAT_ID` in the corresponding config. Use the same ID when both environments notify the same group.
- Save the Worker's base HTTPS URL in each organizer panel. This stores the URL for `/notify`; it does not call `/setup` or register a webhook.
- Add participant Telegram usernames separately in each environment. Missing usernames fall back to participant names and are flagged in the organizer panel.
- The organizer's name-visibility setting applies to chat, organizer-notice, and draw notifications, and is stored separately in each environment's database.
- In debug, the organizer can separately enable rotating secret nicknames for chat-message notifications. Each participant gets a nickname per conversation when opening it; background chat refreshes do not rotate it. Until a nickname exists, the group notification stays generic. Showing real names takes precedence over nicknames.
- Never commit `config.php` files or share their values. Delete any old webhook pointing to the InfinityFree PHP endpoint; do not register it again.
