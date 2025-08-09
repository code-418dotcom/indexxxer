from sqlalchemy.orm import declarative_base
Base = declarative_base()
from typing import Optional
from sqlmodel import SQLModel, Field

class Actress(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    path: str

class Media(SQLModel, table=True):
    preferred_thumb: str | None = Field(default=None)
    id: Optional[int] = Field(default=None, primary_key=True)
    actress_id: int = Field(index=True)
    path: str
    rel_path: str
    filename: str
    ext: str
    type: str
    duration: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    size_bytes: Optional[int] = None
    thumb_path: Optional[str] = None
    last_position: Optional[float] = None


# ----------------------
# Performers
# ----------------------
from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime

class Performer(Base):
    __tablename__ = "performers"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), unique=True, index=True, nullable=False)
    aliases = Column(Text, default="")
    site_url = Column(Text, default="")
    image_url = Column(Text, default="")
    bio_url = Column(Text, default="")
    profile_summary = Column(Text, default="")
    dob = Column(String(50), default="")
    age = Column(Integer, default=None)
    career_status = Column(String(100), default="")
    career_start = Column(String(50), default="")
    career_end = Column(String(50), default="")
    dod = Column(String(50), default="")
    pob = Column(String(255), default="")
    ethnicity = Column(String(100), default="")
    boobs = Column(String(50), default="")
    bust = Column(String(50), default="")
    cup = Column(String(50), default="")
    bra = Column(String(50), default="")
    waist = Column(String(50), default="")
    hip = Column(String(50), default="")
    butt = Column(String(50), default="")
    height = Column(String(50), default="")
    weight = Column(String(50), default="")
    hair_color = Column(String(100), default="")
    eye_color = Column(String(100), default="")
    piercings = Column(String(255), default="")
    piercing_locations = Column(String(255), default="")
    tattoos = Column(String(255), default="")
    tattoo_locations = Column(String(255), default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
