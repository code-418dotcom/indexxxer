# Auto-create tables on import
try:
    from .database import engine
    from .models import Base
    Base.metadata.create_all(bind=engine)
except Exception as e:
    import logging
    logging.getLogger(__name__).warning("Auto-migrate skipped: %s", e)
