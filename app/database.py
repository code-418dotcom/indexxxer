from sqlmodel import SQLModel, create_engine, Session
import os
from .models import Base

DB_PATH = os.getenv("DB_PATH", "/app/app/db/media.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)

def init_db():
    SQLModel.metadata.create_all(engine)
    Base.metadata.create_all(engine)
    # simple migration: add preferred_thumb if missing
    with engine.connect() as conn:
        cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info('media')").all()]
        if 'preferred_thumb' not in cols:
            conn.exec_driver_sql("ALTER TABLE media ADD COLUMN preferred_thumb TEXT")
        # performers extra columns
        cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info('performers')").all()]
        for col, typ in {
            "dob": "TEXT",
            "age": "INTEGER",
            "career_status": "TEXT",
            "career_start": "TEXT",
            "career_end": "TEXT",
            "dod": "TEXT",
            "pob": "TEXT",
            "ethnicity": "TEXT",
            "boobs": "TEXT",
            "bust": "TEXT",
            "cup": "TEXT",
            "bra": "TEXT",
            "waist": "TEXT",
            "hip": "TEXT",
            "butt": "TEXT",
            "height": "TEXT",
            "weight": "TEXT",
            "hair_color": "TEXT",
            "eye_color": "TEXT",
            "piercings": "TEXT",
            "piercing_locations": "TEXT",
            "tattoos": "TEXT",
            "tattoo_locations": "TEXT",
        }.items():
            if col not in cols:
                conn.exec_driver_sql(f"ALTER TABLE performers ADD COLUMN {col} {typ}")

def get_session():
    return Session(engine)
