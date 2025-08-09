from sqlmodel import SQLModel, create_engine, Session
import os

DB_PATH = os.getenv("DB_PATH", "/app/app/db/media.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)

def init_db():
    SQLModel.metadata.create_all(engine)
    # simple migration: add preferred_thumb if missing
    with engine.connect() as conn:
        cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info('media')").all()]
        if 'preferred_thumb' not in cols:
            conn.exec_driver_sql("ALTER TABLE media ADD COLUMN preferred_thumb TEXT")

def get_session():
    return Session(engine)
