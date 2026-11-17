"""Authorize a dedicated Telegram collector locally. Never log codes or session contents."""
import asyncio
import getpass
import os
from pathlib import Path


async def main():
    try:
        from telethon import TelegramClient
    except ImportError:
        raise SystemExit('Install the source runtime requirements first: python -m pip install -r scripts/source-execution.requirements.txt')
    session = Path(os.environ['TELEGRAM_SESSION_PATH']).resolve()
    session.parent.mkdir(parents=True, exist_ok=True)
    client = TelegramClient(str(session), int(os.environ['TELEGRAM_API_ID']), os.environ['TELEGRAM_API_HASH'])
    try:
        await client.start(
            phone=lambda: input('Collector account phone number (including country code): ').strip(),
            code_callback=lambda: getpass.getpass('Telegram login code (hidden): '),
            password=lambda: getpass.getpass('Telegram two-step password, if enabled (hidden): '),
        )
        if not await client.is_user_authorized():
            raise SystemExit('Telegram did not authorize this session.')
        try:
            session.chmod(0o600)
        except OSError:
            pass
        print('Collector session authorized and saved locally. Never share or commit the session file.')
    finally:
        await client.disconnect()


if __name__ == '__main__':
    asyncio.run(main())
