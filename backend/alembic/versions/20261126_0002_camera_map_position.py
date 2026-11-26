"""camera map position (lat, lng, location_name) and physical camera address

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-26
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("cameras", schema=None) as batch_op:
        batch_op.add_column(sa.Column("lat", sa.Double(), nullable=True))
        batch_op.add_column(sa.Column("lng", sa.Double(), nullable=True))
        batch_op.add_column(sa.Column("location_name", sa.String(length=255), nullable=False, server_default=""))
        batch_op.add_column(sa.Column("remote_address", sa.String(length=255), nullable=False, server_default=""))
        batch_op.create_index(batch_op.f("ix_cameras_remote_address"), ["remote_address"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("cameras", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_cameras_remote_address"))
        batch_op.drop_column("remote_address")
        batch_op.drop_column("location_name")
        batch_op.drop_column("lng")
        batch_op.drop_column("lat")
