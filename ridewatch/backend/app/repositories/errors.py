class StorageUnavailable(Exception):
    def __init__(self):
        super().__init__("RideWatch storage is temporarily unavailable. Please try again.")


class WriteConflict(Exception):
    """A conditional write lost a race; callers must re-read before retrying."""


class RideNotActive(Exception):
    pass
