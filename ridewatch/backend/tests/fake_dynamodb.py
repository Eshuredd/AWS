"""Small deterministic DynamoDB test double; conditions evaluated atomically.

Implements only operations/expressions used by RideWatch. Botocore Stubber tests
separately validate the real SDK wire shapes. This never opens a network socket.
"""
from copy import deepcopy
from threading import RLock
from botocore.exceptions import ClientError
from app.repositories.dynamodb import decode


class FakeDynamoDB:
    def __init__(self):
        self.items = {}
        self.lock = RLock()
        self.calls = []
        self.before_transaction = None
        self.page_size = 2

    @staticmethod
    def key(item):
        return item["pk"]["S"]

    def condition(self, operation):
        expression = operation.get("ConditionExpression")
        if not expression:
            return True
        key = self.key(operation.get("Key", operation.get("Item")))
        stored = self.items.get(key)
        if expression == "attribute_not_exists(pk)":
            return stored is None
        if stored is None:
            return False
        left, right = expression.split(" = ")
        names = operation.get("ExpressionAttributeNames", {})
        value = decode(stored)
        for part in left.split("."):
            value = value.get(names.get(part, part)) if isinstance(value, dict) else None
        return value == decode(operation["ExpressionAttributeValues"])[right]

    def get_item(self, **kwargs):
        assert kwargs["ConsistentRead"] is True
        with self.lock:
            self.calls.append(("get_item", deepcopy(kwargs)))
            item = self.items.get(self.key(kwargs["Key"]))
            return {"Item": deepcopy(item)} if item else {}

    def put_item(self, **kwargs):
        with self.lock:
            self.calls.append(("put_item", deepcopy(kwargs)))
            if not self.condition(kwargs):
                raise ClientError({"Error": {"Code": "ConditionalCheckFailedException"}}, "PutItem")
            self.items[self.key(kwargs["Item"])] = deepcopy(kwargs["Item"])
            return {}

    def delete_item(self, **kwargs):
        with self.lock:
            self.calls.append(("delete_item", deepcopy(kwargs)))
            self.items.pop(self.key(kwargs["Key"]), None)
            return {}

    def transact_write_items(self, **kwargs):
        if self.before_transaction:
            hook, self.before_transaction = self.before_transaction, None
            hook()
        with self.lock:
            self.calls.append(("transact_write_items", deepcopy(kwargs)))
            actions = kwargs["TransactItems"]
            codes = [{"Code": "None" if self.condition(next(iter(action.values()))) else "ConditionalCheckFailed"} for action in actions]
            if any(code["Code"] != "None" for code in codes):
                raise ClientError({"Error": {"Code": "TransactionCanceledException"}, "CancellationReasons": codes}, "TransactWriteItems")
            for action in actions:
                if "Put" in action:
                    item = action["Put"]["Item"]
                    self.items[self.key(item)] = deepcopy(item)
                elif "Delete" in action:
                    self.items.pop(self.key(action["Delete"]["Key"]), None)
            return {}

    def scan(self, **kwargs):
        with self.lock:
            self.calls.append(("scan", deepcopy(kwargs)))
            assert kwargs["FilterExpression"] == "#entity = :entity"
            assert kwargs["ExpressionAttributeNames"] == {"#entity": "entity_type"}
            assert kwargs["ExpressionAttributeValues"] == {":entity": {"S": "FARE_REPORT"}}
            keys = sorted(self.items)
            start = keys.index(self.key(kwargs["ExclusiveStartKey"])) + 1 if "ExclusiveStartKey" in kwargs else 0
            page = keys[start:start + self.page_size]
            result = {"Items": [deepcopy(self.items[key]) for key in page if self.items[key]["entity_type"]["S"] == "FARE_REPORT"]}
            if start + self.page_size < len(keys):
                result["LastEvaluatedKey"] = {"pk": {"S": page[-1]}}
            return result
