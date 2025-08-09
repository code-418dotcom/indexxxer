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
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
