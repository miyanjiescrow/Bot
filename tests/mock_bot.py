"""
Mock Telegram Bot Test Harness for Miyanji Escrow Platform
Enables full headless execution of real message and callback_query handlers in test scenarios.
"""
import sys
import types
import re

# 1. Setup Mock Telebot module if real telebot not available
if 'telebot' not in sys.modules:
    tb = types.ModuleType('telebot')
    tb.__path__ = []
    tb_types = types.ModuleType('telebot.types')
    tb_types.__path__ = []
    tb_apihelper = types.ModuleType('telebot.apihelper')
    tb_backends = types.ModuleType('telebot.handler_backends')

    class State: pass
    class StatesGroup: pass
    tb_backends.State = State
    tb_backends.StatesGroup = StatesGroup

    class DummyObj:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)
        def __call__(self, *args, **kwargs):
            return self
        def add(self, *args, **kwargs):
            return self

    class WebAppInfo(DummyObj):
        def __init__(self, url=None, **kwargs):
            super().__init__(url=url, **kwargs)

    class InlineKeyboardMarkup(DummyObj):
        def __init__(self, row_width=1, **kwargs):
            super().__init__(row_width=row_width, **kwargs)
            self.keyboard = []
        def add(self, *buttons):
            self.keyboard.append(list(buttons))
            return self
        def row(self, *buttons):
            self.keyboard.append(list(buttons))
            return self

    class InlineKeyboardButton(DummyObj):
        def __init__(self, text, callback_data=None, url=None, web_app=None, **kwargs):
            super().__init__(text=text, callback_data=callback_data, url=url, web_app=web_app, **kwargs)

    class ReplyKeyboardMarkup(DummyObj):
        def __init__(self, resize_keyboard=True, one_time_keyboard=False, **kwargs):
            super().__init__(resize_keyboard=resize_keyboard, one_time_keyboard=one_time_keyboard, **kwargs)
            self.keyboard = []
        def add(self, *buttons):
            self.keyboard.append(list(buttons))
            return self
        def row(self, *buttons):
            self.keyboard.append(list(buttons))
            return self

    class KeyboardButton(DummyObj):
        def __init__(self, text, request_contact=False, web_app=None, **kwargs):
            super().__init__(text=text, request_contact=request_contact, web_app=web_app, **kwargs)

    class Contact(DummyObj):
        def __init__(self, phone_number, first_name="", user_id=None, **kwargs):
            super().__init__(phone_number=phone_number, first_name=first_name, user_id=user_id, **kwargs)

    class Chat(DummyObj):
        def __init__(self, id=1001, type="private", title=None, **kwargs):
            super().__init__(id=id, type=type, title=title, **kwargs)

    class User(DummyObj):
        def __init__(self, id=1001, first_name="Test", last_name="User", username="testuser", is_bot=False, **kwargs):
            super().__init__(id=id, first_name=first_name, last_name=last_name, username=username, is_bot=is_bot, **kwargs)

    class Message(DummyObj):
        def __init__(self, text="", chat_id=1001, user_id=1001, username="testuser", first_name="Test", contact=None, content_type="text", **kwargs):
            super().__init__(text=text, content_type=content_type, **kwargs)
            self.message_id = kwargs.get("message_id", 100)
            self.chat = Chat(id=chat_id)
            self.from_user = User(id=user_id, username=username, first_name=first_name)
            self.contact = contact

    class CallbackQuery(DummyObj):
        def __init__(self, data="", chat_id=1001, user_id=1001, username="testuser", message=None, **kwargs):
            super().__init__(data=data, **kwargs)
            self.id = kwargs.get("id", "cq_999")
            self.from_user = User(id=user_id, username=username)
            self.message = message or Message(chat_id=chat_id, user_id=user_id, username=username)

    class ExceptionHandler:
        def handle(self, exception):
            return True

    class ApiTelegramException(Exception):
        def __init__(self, error_code, description, *args):
            self.error_code = error_code
            self.description = description
            super().__init__(f"Error {error_code}: {description}")

    class MockTeleBot:
        def __init__(self, token="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11", *args, **kwargs):
            self.token = token
            self.message_handlers = []
            self.callback_query_handlers = []
            self.sent_messages = []
            self.answered_callbacks = []
            self.edited_messages = []

        def message_handler(self, *d_args, **d_kwargs):
            def decorator(fn):
                self.message_handlers.append({"fn": fn, "args": d_args, "kwargs": d_kwargs})
                return fn
            return decorator

        def channel_post_handler(self, *d_args, **d_kwargs):
            def decorator(fn):
                self.message_handlers.append({"fn": fn, "args": d_args, "kwargs": d_kwargs, "type": "channel_post"})
                return fn
            return decorator

        def edited_message_handler(self, *d_args, **d_kwargs):
            def decorator(fn):
                self.message_handlers.append({"fn": fn, "args": d_args, "kwargs": d_kwargs, "type": "edited_message"})
                return fn
            return decorator

        def callback_query_handler(self, *d_args, **d_kwargs):
            def decorator(fn):
                self.callback_query_handlers.append({"fn": fn, "args": d_args, "kwargs": d_kwargs})
                return fn
            return decorator

        def send_message(self, chat_id, text, reply_markup=None, parse_mode=None, **kwargs):
            record = {
                "chat_id": chat_id,
                "text": text,
                "reply_markup": reply_markup,
                "parse_mode": parse_mode,
                "kwargs": kwargs
            }
            self.sent_messages.append(record)
            msg_id = len(self.sent_messages)
            return Message(text=text, chat_id=chat_id, message_id=msg_id)

        def edit_message_text(self, text, chat_id=None, message_id=None, reply_markup=None, parse_mode=None, **kwargs):
            record = {
                "chat_id": chat_id,
                "message_id": message_id,
                "text": text,
                "reply_markup": reply_markup,
                "parse_mode": parse_mode,
                "kwargs": kwargs
            }
            self.edited_messages.append(record)
            return Message(text=text, chat_id=chat_id or 1001, message_id=message_id or 100)

        def answer_callback_query(self, callback_query_id, text=None, show_alert=False, **kwargs):
            self.answered_callbacks.append({"id": callback_query_id, "text": text, "show_alert": show_alert})
            return True

        def delete_message(self, chat_id, message_id):
            return True

        def send_document(self, chat_id, document, caption=None, reply_markup=None, **kwargs):
            self.sent_messages.append({
                "chat_id": chat_id,
                "document": document,
                "caption": caption,
                "reply_markup": reply_markup,
                "kwargs": kwargs
            })
            return Message(text=caption or "[Document]", chat_id=chat_id)

        def get_me(self):
            return User(id=8426620749, username="MianJi_ir_bot", first_name="میانجی | Miyanji Escrow", is_bot=True)

        def stop_polling(self):
            pass

        def get_last_message(self, chat_id=None):
            if not self.sent_messages:
                return None
            if chat_id is None:
                return self.sent_messages[-1]
            matching = [m for m in self.sent_messages if m.get("chat_id") == chat_id]
            return matching[-1] if matching else None

        def clear_history(self):
            self.sent_messages.clear()
            self.answered_callbacks.clear()
            self.edited_messages.clear()

        def dispatch_message(self, message):
            """Simulates telebot update dispatcher for messages"""
            for h in self.message_handlers:
                func = h["kwargs"].get("func")
                commands = h["kwargs"].get("commands")
                content_types = h["kwargs"].get("content_types", ["text"])

                if message.content_type not in content_types:
                    continue

                if commands:
                    txt = (message.text or "").strip()
                    if not txt.startswith("/"):
                        continue
                    cmd = txt.split()[0][1:].split("@")[0].lower()
                    if cmd not in [c.lower() for c in commands]:
                        continue

                if func and not func(message):
                    continue

                try:
                    h["fn"](message)
                    return True
                except Exception as e:
                    print(f"Handler error: {e}")
                    raise e
            return False

        def dispatch_callback(self, callback_query):
            """Simulates telebot update dispatcher for callback queries"""
            for h in self.callback_query_handlers:
                func = h["kwargs"].get("func")
                if func and not func(callback_query):
                    continue
                try:
                    h["fn"](callback_query)
                    return True
                except Exception as e:
                    print(f"Callback handler error: {e}")
                    raise e
            return False

    tb.TeleBot = MockTeleBot
    tb.ExceptionHandler = ExceptionHandler
    tb.apihelper = tb_apihelper
    tb.types = tb_types
    tb.handler_backends = tb_backends
    tb_apihelper.ApiTelegramException = ApiTelegramException

    tb_types.InlineKeyboardMarkup = InlineKeyboardMarkup
    tb_types.InlineKeyboardButton = InlineKeyboardButton
    tb_types.ReplyKeyboardMarkup = ReplyKeyboardMarkup
    tb_types.KeyboardButton = KeyboardButton
    tb_types.WebAppInfo = WebAppInfo
    tb_types.ReplyKeyboardRemove = DummyObj
    tb_types.Contact = Contact
    tb_types.Chat = Chat
    tb_types.User = User
    tb_types.Message = Message
    tb_types.CallbackQuery = CallbackQuery

    sys.modules['telebot'] = tb
    sys.modules['telebot.types'] = tb_types
    sys.modules['telebot.apihelper'] = tb_apihelper
    sys.modules['telebot.handler_backends'] = tb_backends

import telebot
from telebot.types import Message, CallbackQuery, Contact
