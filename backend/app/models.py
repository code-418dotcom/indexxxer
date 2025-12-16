from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    String,
    Integer,
    Boolean,
    Text,
    BigInteger,
    Column,
    ForeignKey,
    Float,
    DateTime,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Performer(Base):
    __tablename__ = "performers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    name: Mapped[str] = mapped_column(String(255), index=True)
    aliases: Mapped[str | None] = mapped_column(Text, nullable=True)

    date_of_birth: Mapped[str | None] = mapped_column(String(32), nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)

    career_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    career_start: Mapped[str | None] = mapped_column(String(32), nullable=True)
    career_end: Mapped[str | None] = mapped_column(String(32), nullable=True)

    date_of_death: Mapped[str | None] = mapped_column(String(32), nullable=True)
    place_of_birth: Mapped[str | None] = mapped_column(Text, nullable=True)
    ethnicity: Mapped[str | None] = mapped_column(String(64), nullable=True)

    boobs: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bust: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cup: Mapped[str | None] = mapped_column(String(16), nullable=True)
    bra: Mapped[str | None] = mapped_column(String(32), nullable=True)
    waist: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hip: Mapped[int | None] = mapped_column(Integer, nullable=True)
    butt: Mapped[str | None] = mapped_column(String(64), nullable=True)

    height: Mapped[int | None] = mapped_column(Integer, nullable=True)  # cm
    weight: Mapped[int | None] = mapped_column(Integer, nullable=True)  # kg

    hair_color: Mapped[str | None] = mapped_column(String(64), nullable=True)
    eye_color: Mapped[str | None] = mapped_column(String(64), nullable=True)

    piercings: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    piercing_locations: Mapped[str | None] = mapped_column(Text, nullable=True)

    tattoos: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    tattoo_locations: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Many-to-many: Performer <-> MediaItem
    media_links: Mapped[list["PerformerMedia"]] = relationship(
        "PerformerMedia",
        back_populates="performer",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class MediaItem(Base):
    __tablename__ = "media_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rel_path: Mapped[str] = mapped_column(Text, unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(32))
    ext: Mapped[str | None] = mapped_column(String(16), nullable=True)
    size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    mtime: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    performer_links: Mapped[list["PerformerMedia"]] = relationship(
        "PerformerMedia",
        back_populates="media_item",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class PerformerMedia(Base):
    __tablename__ = "performer_media"
    __table_args__ = (
        UniqueConstraint("performer_id", "media_item_id", name="uq_performer_media"),
    )

    id = Column(Integer, primary_key=True, index=True)
    performer_id = Column(
        Integer, ForeignKey("performers.id", ondelete="CASCADE"), index=True, nullable=False
    )
    media_item_id = Column(
        Integer, ForeignKey("media_items.id", ondelete="CASCADE"), index=True, nullable=False
    )

    confidence = Column(Float, default=0.0)
    matched_by = Column(String, default="filename")  # folder|filename|alias|partial
    created_at = Column(DateTime, default=datetime.utcnow)

    performer = relationship("Performer", back_populates="media_links")
    media_item = relationship("MediaItem", back_populates="performer_links")
